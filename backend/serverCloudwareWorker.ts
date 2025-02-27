export interface Env {
    FLAG_CACHE: KVNamespace;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
}

const TTL_SECONDS = 12 * 60 * 60; // 12 hours cache expiration
const RATE_LIMIT_KEY_PREFIX = "rl_";
const RATE_LIMIT_MAX = 100; // Max requests per 15 minutes
const RATE_LIMIT_WINDOW_SEC = 900; // 15 minutes

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url);

        if (url.pathname === "/api/getFlag") {
            return await handleGetFlag(req, env);
        }

        return createJsonResponse({ success: false, message: "Not Found" }, 404);
    },
};

// ✅ **Helper Function for Consistent Response Handling**
const createJsonResponse = (data: object, statusCode: number): Response => {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
    });
};

// ✅ **Rate Limiting with Cloudflare KV**
const isRateLimited = async (req: Request, env: Env): Promise<boolean> => {
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    const ua = req.headers.get("User-Agent") || "unknown";
    const key = `${RATE_LIMIT_KEY_PREFIX}${ip}_${ua}`;

    let requestCount = await env.FLAG_CACHE.get(key);
    let count = requestCount ? parseInt(requestCount) : 0;

    if (count >= RATE_LIMIT_MAX) {
        return true;
    }

    await env.FLAG_CACHE.put(key, (count + 1).toString(), {
        expirationTtl: RATE_LIMIT_WINDOW_SEC,
    });

    return false;
};

// ✅ **Validate Query Parameters (Stricter Validation)**
const validateQueryParams = (url: URL): string | null => {
    const country = url.searchParams.get("country")?.toUpperCase();
    if (!country || !/^[A-Z]{2}$/.test(country)) {
        return "Invalid country parameter. Must be a 2-letter uppercase country code.";
    }
    return null;
};

// ✅ **Fetch Signed URL from Cloudinary**
const fetchFromCloudinary = async (
    country: string,
    env: Env
): Promise<string> => {
    const filePath = `flags/${country}.svg`;
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    // Construct signed Cloudinary URL
    const cloudinaryUrl = new URL(
        `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${filePath}`
    );

    cloudinaryUrl.searchParams.set("api_key", env.CLOUDINARY_API_KEY);
    cloudinaryUrl.searchParams.set("timestamp", expiresAt.toString());

    // ✅ Generate SHA-256 signature correctly (Hexadecimal conversion)
    const stringToSign = `timestamp=${expiresAt}${env.CLOUDINARY_API_SECRET}`;
    const signatureBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stringToSign)
    );

    // Convert signature buffer to hex string
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    cloudinaryUrl.searchParams.set("signature", signatureHex);

    return cloudinaryUrl.toString();
};

// ✅ **Fetch & Cache Flag (With Cloudflare KV)**
const fetchAndCacheFlag = async (
    country: string,
    env: Env
): Promise<string> => {
    try {
        const secureUrl = await fetchFromCloudinary(country, env);

        if (!secureUrl) {
            return "";
        }

        // Store URL in KV with TTL
        await env.FLAG_CACHE.put(`flag_${country}`, secureUrl, {
            expirationTtl: TTL_SECONDS,
        });

        return secureUrl;
    } catch (error) {
        console.error(`Error fetching flag for ${country}: ${error}`);
        // Log error but return just the URL instead of error response here
        return "";
    }
};

// ✅ **Handle API Request for Flags**
const handleGetFlag = async (req: Request, env: Env): Promise<Response> => {
    const url = new URL(req.url);

    // **Rate Limiting**
    if (await isRateLimited(req, env)) {
        return createJsonResponse(
            { success: false, message: "Rate limit exceeded." },
            429
        );
    }

    // **Validate Country Query Param**
    const errorMessage = validateQueryParams(url);
    if (errorMessage) {
        return createJsonResponse({ success: false, message: errorMessage }, 400);
    }

    const country = url.searchParams.get("country")!.toUpperCase();
    const cacheKey = `flag_${country}`;

    // **Check Cloudflare KV Cache**
    const cachedUrl = await env.FLAG_CACHE.get(cacheKey);
    if (cachedUrl) {
        (async () => {
            const refreshedUrl = await fetchAndCacheFlag(country, env).catch(
                console.error
            );
            if (refreshedUrl) {
                await env.FLAG_CACHE.put(cacheKey, refreshedUrl, {
                    expirationTtl: TTL_SECONDS,
                });
            }
        })();
        return createJsonResponse({ success: true, secureUrl: cachedUrl }, 200);
    }

    // **Fetch from Cloudinary If Not Found in KV**
    try {
        const secureUrl = await fetchAndCacheFlag(country, env);

        if (!secureUrl) {
            return createJsonResponse(
                { success: false, message: "Cloudinary fetch error" },
                500
            );
        }

        return createJsonResponse({ success: true, secureUrl }, 200);
    } catch (error) {
        return createJsonResponse(
            { success: false, message: (error as Error).message },
            500
        );
    }
};
