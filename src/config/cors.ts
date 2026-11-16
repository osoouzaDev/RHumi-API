/**
 * Configuração de CORS (Cross-Origin Resource Sharing) do Express.
 *
 * Objetivo:
 *  - Bloquear requisições provenientes de origens não autorizadas (browser-side),
 *    aplicando a política de Same-Origin Policy com permissões explícitas.
 *
 * Estratégia adotada:
 *  - Lista dinâmica via `CORS_ALLOWED_ORIGINS` (separada por vírgula, .env).
 *  - Origens padrão de desenvolvimento (localhost:4200 para Website Angular,
 *    localhost:3000/3001, e 127.0.0.1) SEMPRE são liberadas.
 *  - Normalização para remover barras finais (trailing slashes).
 *  - `credentials: true` = permite envio de cookies HTTP-only e credenciais cross-origin.
 */

import type { CorsOptions } from "cors";
import { env } from "./env.js";

/**
 * Origens locais liberadas apenas durante o desenvolvimento.
 */
const defaultAllowOrigins = env.isProduction
    ? []
    : [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ];

/**
 * Origens configuradas no ambiente. `CORS_ORIGIN` também é aceito para
 * compatibilidade com o nome usado pelo branch kauaDev.
 */
const envAllowOrigins = [
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.CORS_ORIGIN,
]
    .filter((origins): origins is string => Boolean(origins))
    .flatMap((origins) => origins.split(","))
    .map((origin) => origin.trim())
    .filter(Boolean);

/**
 * Conjunto efetivo de origens permitidas, normalizadas e deduplicadas.
 */
const effectiveAllowedOrigins = [
    ...new Set(
        [...defaultAllowOrigins, ...envAllowOrigins].map((origin) =>
            origin.trim().replace(/\/$/, "")
        )
    ),
];

/**
 * Predicado que verifica se uma `origin` do browser está na whitelist.
 */
function isAllowedOrigin(origin: string): boolean {
    const normalized = origin.trim().replace(/\/$/, "");
    return effectiveAllowedOrigins.includes(normalized);
}

/**
 * Opções finais de CORS repassadas ao middleware `cors(corsOptions)`.
 */
export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        // Permite requisições sem origin (ex.: Postman, cURL, scripts backend)
        if (!origin) {
            return callback(null, true);
        }

        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    credentials: true,
    optionsSuccessStatus: 204,
};

export default corsOptions;
