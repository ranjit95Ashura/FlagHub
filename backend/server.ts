import express, { Application, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import cloudinary from "cloudinary";
import cors from "cors";
import rateLimit from "express-rate-limit";
import compression from "compression";
import morgan from "morgan";
import { LRUCache } from "lru-cache";
import axios from "axios";
import axiosRetry from "axios-retry";
import asyncHandler from "express-async-handler";
import Joi from "joi"; // Import Joi for validation

// Load environment variables
dotenv.config();

// Ensure required environment variables are set
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME as string;
const API_KEY = process.env.CLOUDINARY_API_KEY as string;
const API_SECRET = process.env.CLOUDINARY_API_SECRET as string;
const PORT = parseInt(process.env.PORT || "3000", 10);

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error("Missing required Cloudinary environment variables.");
}

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
});

// Express App Setup
const app: Application = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan("combined")); // Logging requests

// LRU Cache Configuration (Efficient caching)
const cache = new LRUCache<string, { url: string; expiresAt: number }>({
    max: 500, // Max cache items
    ttl: 12 * 60 * 60 * 1000, // 12 hours (in ms)
});

// Rate Limiting to Prevent Abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: {
        success: false,
        message: "Too many requests, please try again later.",
    },
});
app.use("/api/getFlag", limiter);

// Axios Retry for Cloudinary Requests
axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

/**
 * Utility function to send a success response
 */
const successResponse = (
    res: Response,
    data: object,
    message = "Success",
    statusCode = 200
) => {
    res.status(statusCode).json({ success: true, message, ...data });
};

/**
 * Utility function to handle errors consistently
 */
const catchErrorResponse = (
    res: Response,
    error: unknown,
    message = "Something went wrong",
    statusCode = 500
) => {
    console.error("Error:", error);
    res.status(statusCode).json({ success: false, message });
};

/**
 * Joi schema for validating query parameters
 */
const flagQueryValidationSchema = Joi.object({
    country: Joi.string().required().min(2).max(3).uppercase().messages({
        "string.base": `"country" should be a type of 'text'`,
        "string.empty": `"country" cannot be an empty field`,
        "string.min": `"country" should have a minimum length of {#limit}`,
        "string.max": `"country" should have a maximum length of {#limit}`,
        "any.required": `"country" is a required field`,
    }),
});

/**
 * Middleware to validate query parameters using Joi
 */
const validateQueryParams = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { error } = flagQueryValidationSchema.validate(req.query);
    if (error) {
        return catchErrorResponse(res, error, error.details[0].message, 400);
    }
    next();
};

/**
 * Get a signed URL for a country flag image
 */
const getFlagHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    // Ensure it returns void
    try {
        const country = req.query.country as string;

        const cacheKey = `flag_${country.toUpperCase()}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData && Date.now() < cachedData.expiresAt) {
            successResponse(res, { secureUrl: cachedData.url });
            return;
        }

        const filePath = `flags/${country.toUpperCase()}.svg`;
        const expiresInSeconds = 12 * 60 * 60;

        // Generate signed URL (convert to WebP for efficiency)
        const signedUrl = cloudinary.v2.url(filePath, {
            sign_url: true,
            expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
            format: "webp", // Convert to WebP (smaller & faster)
        });

        // Store in cache
        cache.set(cacheKey, {
            url: signedUrl,
            expiresAt: Date.now() + expiresInSeconds * 1000,
        });

        successResponse(res, { secureUrl: signedUrl });
    } catch (error) {
        next(error);
    }
};

// Define the route with validation middleware first
app.get("/api/getFlag", validateQueryParams, asyncHandler(getFlagHandler));

// Global error handler (catches unhandled errors)
app.use(((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled error:", err);
    catchErrorResponse(res, { errCAR: err }, "Unhandled error", 400);
}) as express.ErrorRequestHandler);

// Start the server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
