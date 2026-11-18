import type { CorsOptions } from "cors";
import { env } from "./env.js";

const defaultAllowOrigins = env.isProduction
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ];

const envAllowOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

const effectiveAllowedOrigins = [...new Set([...defaultAllowOrigins, ...envAllowOrigins])];

export function isAllowedOrigin(origin: string): boolean {
    return effectiveAllowedOrigins.includes(origin);
}

export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
};