import { CorsOptions } from 'cors';
import { env } from "./env";

const defaultAllowOrigins = env.isProduction
    ? [
         "http://localhost:3000",
          "http://localhost:3001",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:3001",
          
    ];

    const envAllowOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

    const effectiveAllowedOrigins = [...new Set([...defaultAllowedOrigins, ...envAllowedOrigins])];

    function isAllowedorigin(origin: string): boolean {
        return effectiveAllowedOrigins.includes(origin);
    }

    export const corsOptions: CorsOptions ={
        origin: (origin, callback) => {

            if (!origin) {
                return callback(null, true);
            }

            if (isAllowedorigin(origin)) {
                return callback(null, true);
            }

            return callback(new Error('Origim não permitida pelo CORS: ${origin}'));
    },
    methods:[ "GET", "POST", "PUT", "DELETE", "OPTIONS" ],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
};