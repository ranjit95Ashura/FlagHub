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
        if (req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        const url = new URL(req.url);
        if (url.pathname === "/api/getFlag") {
            return await handleGetFlag(req, env);
        }

        return createJsonResponse({ success: false, message: "Not Found" }, 404);
    },
};

const createJsonResponse = (data: object, statusCode: number): Response => {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
};

const getRateLimitKey = (req: Request): string => {
    const ip = req.headers.get("CF-Connecting-IP") || "unknown_ip";
    const ua = req.headers.get("User-Agent") || "unknown_ua";
    return `${RATE_LIMIT_KEY_PREFIX}${ip}_${ua}`;
};

const isRateLimited = async (req: Request, env: Env): Promise<boolean> => {
    const key = getRateLimitKey(req);
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

const validateQueryParams = (url: URL): string | null => {
    const country = url.searchParams.get("country")?.toUpperCase();
    if (!country || !/^[A-Z]{2}$/.test(country)) {
        return "Invalid country parameter. Must be a 2-letter uppercase country code.";
    }
    return null;
};

const generateCloudinarySignature = async (
    params: Record<string, string>,
    env: Env
): Promise<string> => {
    const queryString = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.CLOUDINARY_API_SECRET),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(queryString)
    );
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const signatureHex = signatureArray
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    return signatureHex;
};

const fetchSignedCloudinaryUrl = async (
    country: string,
    env: Env
): Promise<string | null> => {
    const filePath = `flags/${country}.svg`;
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    const params = {
        timestamp: expiresAt.toString(),
        public_id: filePath,
    };

    const signature = await generateCloudinarySignature(params, env);

    const cloudinaryUrl = new URL(
        `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${filePath}`
    );

    cloudinaryUrl.searchParams.set("api_key", env.CLOUDINARY_API_KEY);
    cloudinaryUrl.searchParams.set("timestamp", params.timestamp);
    cloudinaryUrl.searchParams.set("signature", signature);

    const response = await fetch(cloudinaryUrl.toString(), {
        headers: { "Content-Type": "image/svg+xml" },
    });

    if (!response.ok) {
        console.error(`Flag not found on Cloudinary: ${filePath}`);
        return null;
    }

    return cloudinaryUrl.toString();
};

const fetchAndCacheFlag = async (
    country: string,
    env: Env
): Promise<string> => {
    try {
        const secureUrl = await fetchSignedCloudinaryUrl(country, env);
        if (!secureUrl) return "";

        await env.FLAG_CACHE.put(`flag_${country}`, secureUrl, {
            expirationTtl: TTL_SECONDS,
        });

        return secureUrl;
    } catch (error) {
        console.error(`Error fetching flag for ${country}: ${error}`);
        return "";
    }
};

const handleGetFlag = async (req: Request, env: Env): Promise<Response> => {
    const url = new URL(req.url);

    if (await isRateLimited(req, env)) {
        return createJsonResponse(
            { success: false, message: "Rate limit exceeded." },
            429
        );
    }

    const errorMessage = validateQueryParams(url);
    if (errorMessage) {
        return createJsonResponse({ success: false, message: errorMessage }, 400);
    }

    const country = url.searchParams.get("country")!.toUpperCase();
    const cacheKey = `flag_${country}`;

    // Check cache
    const cachedUrl = await env.FLAG_CACHE.get(cacheKey);
    if (cachedUrl) {
        return createJsonResponse({ success: true, secureUrl: cachedUrl }, 200);
    }

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
