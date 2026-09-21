/**
 * Configuração de CORS (Cross-Origin Resource Sharing) do Express.
 *
 * Objetivo:
 *  - Bloquear requisições provenientes de origens não autorizadas (browser-side),
 *    aplicando a política de Same-Origin Policy com permissões explícitas.
 *
 * Estratégia adotada:
 *  - Lista dinâmica via `CORS_ALLOWED_ORIGINS` (separada por vírgula, .env).
 *  - Origens padrão de desenvolvimento (localhost:3000/3001, 127.0.0.1) SEMPRE
 *    são liberadas para facilitar fluxo local.
 *  - Deduplicação com `Set` para evitar conflitos caso a mesma origem apareça
 *    tanto na lista padrão quanto na variável de ambiente.
 *  - `credentials: true` = permite envio de cookies HTTP-only cross-origin
 *    (essencial para o fluxo de auth baseado em cookies).
 */

import type { CorsOptions } from "cors";

/**
 * Origens padrão sempre permitidas — tipicamente usadas durante o
 * desenvolvimento local do frontend (Next/React/CRA/Vite em 3000/3001).
 */
const defaultAllowOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
];

/**
 * Origens lidas da variável `CORS_ALLOWED_ORIGINS`.
 * Exemplo de valor: "https://app.dominio.com.br,https://admin.dominio.com.br"
 */
const envAllowOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];

/**
 * Conjunto efetivo de origens permitidas, já deduplicado.
 */
const effectiveAllowedOrigins = [...new Set([...defaultAllowOrigins, ...envAllowOrigins])];

/**
 * Predicado puro que verifica se uma `origin` (cabeçalho `Origin` do browser)
 * está na whitelist. Separado em função própria para facilitar testes unitários.
 */
function isAllowedOrigin(origin: string): boolean {
    return effectiveAllowedOrigins.includes(origin);
}

/**
 * Opções finais de CORS repassadas ao middleware `cors(corsOptions)`.
 *
 * Campos relevantes:
 *  - `origin`: callback dinâmico. Requests SEM cabeçalho `Origin` (ex.: Postman, cURL)
 *    são permitidos (pois o browser é quem faz cumprir o CORS).
 *  - `methods`: verbos HTTP permitidos.
 *  - `allowedHeaders`: cabeçalhos que o cliente pode enviar no preflight.
 *  - `optionsSuccessStatus`: código HTTP para resposta de preflight. Uso `204`
 *    por compatibilidade com navegadores legados (certa implementação antiga
 *    do IE11 rejeita 204).
 */
export const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
};
