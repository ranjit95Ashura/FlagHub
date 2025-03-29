export interface Env {
    FLAG_CACHE: KVNamespace;
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
}

const TTL_SECONDS: number = 12 * 60 * 60;
const RATE_LIMIT_KEY_PREFIX: string = "rl_";
const RATE_LIMIT_MAX: number = 100;
const RATE_LIMIT_WINDOW_SEC: number = 900;

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        return handleRequest(req, env);
    },
};

async function handleRequest(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(),
        });
    }

    const url: URL = new URL(req.url);
    if (url.pathname === "/api/getFlag") {
        return handleGetFlag(req, env);
    }

    return createJsonResponse(
        { success: false, status: "Service unavailable", message: "Not Found" },
        404
    );
}

function corsHeaders(): Record<string, string> {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };
}

function createJsonResponse(data: object, statusCode: number): Response {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
        },
    });
}

function getRateLimitKey(req: Request): string {
    const ip: string = req.headers.get("CF-Connecting-IP") || "unknown_ip";
    return `${RATE_LIMIT_KEY_PREFIX}${ip}`;
}

async function isRateLimited(req: Request, env: Env): Promise<boolean> {
    const key: string = getRateLimitKey(req);
    const requestCount: string | null = await env.FLAG_CACHE.get(key);
    const count: number = requestCount ? parseInt(requestCount) : 0;

    if (count >= RATE_LIMIT_MAX) {
        return true;
    }

    await env.FLAG_CACHE.put(key, (count + 1).toString(), {
        expirationTtl: RATE_LIMIT_WINDOW_SEC,
    });

    return false;
}

async function atomMiddleware(countryParam: string): Promise<string | null> {
    const normalizedInput: string = countryParam.trim().toUpperCase();

    if (/^[A-Z]{2}$/.test(normalizedInput)) {
        return normalizedInput; // Already a valid country code
    }

    try {
        const response: Response = await fetch(
            `https://restcountries.com/v3.1/name/${encodeURIComponent(
                normalizedInput
            )}`
        );
        const data: any = await response.json();

        if (Array.isArray(data) && data.length > 0 && data[0].cca2) {
            return data[0].cca2.toUpperCase();
        }
    } catch (error) {
        console.error(
            `AtomMiddleware: Failed to convert country '${normalizedInput}' -`,
            error
        );
    }

    return null;
}

async function handleGetFlag(req: Request, env: Env): Promise<Response> {
    const url: URL = new URL(req.url);

    if (await isRateLimited(req, env)) {
        return createJsonResponse(
            {
                success: false,
                status: "Rate limited",
                message: "Rate limit exceeded.",
            },
            429
        );
    }

    const countryParam: string | null = url.searchParams.get("country");
    if (!countryParam) {
        return createJsonResponse(
            {
                success: false,
                status: "User error",
                message: "Country parameter is required.",
            },
            400
        );
    }

    const country: string | null = await atomMiddleware(countryParam);
    if (!country) {
        return createJsonResponse(
            {
                success: false,
                status: "User error",
                message: "Invalid country name or code.",
            },
            400
        );
    }

    const cacheKey: string = `flag_${country}`;
    const cachedUrl: string | null = await env.FLAG_CACHE.get(cacheKey);

    if (cachedUrl) {
        return createJsonResponse(
            { success: true, status: "Success", secureUrl: cachedUrl },
            200
        );
    }

    try {
        const secureUrl: string = await fetchAndCacheFlag(country, env);
        if (!secureUrl) {
            return createJsonResponse(
                {
                    success: false,
                    status: "Service error",
                    message: "Cloudinary fetch error",
                },
                500
            );
        }
        return createJsonResponse(
            { success: true, status: "Success", secureUrl },
            200
        );
    } catch (error) {
        return createJsonResponse(
            {
                success: false,
                status: "Service error",
                message: (error as Error).message,
            },
            500
        );
    }
}

async function fetchAndCacheFlag(country: string, env: Env): Promise<string> {
    try {
        const secureUrl: string | null = await fetchSignedCloudinaryUrl(
            country,
            env
        );
        if (!secureUrl) return "";
        await env.FLAG_CACHE.put(`flag_${country}`, secureUrl, {
            expirationTtl: TTL_SECONDS,
        });
        return secureUrl;
    } catch (error) {
        console.error(`Error fetching flag for ${country}:`, error);
        return "";
    }
}

async function fetchSignedCloudinaryUrl(
    country: string,
    env: Env
): Promise<string | null> {
    const filePath: string = `flags/${country}.svg`;
    const expiresAt: number = Math.floor(Date.now() / 1000) + TTL_SECONDS;
    const params: Record<string, string> = {
        timestamp: expiresAt.toString(),
        public_id: filePath,
    };
    const signature: string = await generateCloudinarySignature(params, env);
    const cloudinaryUrl: URL = new URL(
        `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/${filePath}`
    );
    cloudinaryUrl.searchParams.set("api_key", env.CLOUDINARY_API_KEY);
    cloudinaryUrl.searchParams.set("timestamp", params.timestamp);
    cloudinaryUrl.searchParams.set("signature", signature);
    const response: Response = await fetch(cloudinaryUrl.toString(), {
        headers: { "Content-Type": "image/svg+xml" },
    });
    return response.ok ? cloudinaryUrl.toString() : null;
}

async function generateCloudinarySignature(
    params: Record<string, string>,
    env: Env
): Promise<string> {
    const queryString: string = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");
    const encoder: TextEncoder = new TextEncoder();
    const key: CryptoKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.CLOUDINARY_API_SECRET),
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
    );
    const signatureBuffer: ArrayBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(queryString)
    );
    return Array.from(new Uint8Array(signatureBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
