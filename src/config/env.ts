/**
 * Módulo de validação e carregamento centralizado das variáveis de ambiente.
 *
 * Objetivo:
 *  - Validar a presença e a qualidade (força) das variáveis de ambiente OBRIGATÓRIAS
 *    no startup da aplicação, evitando crashes tardios em runtime quando uma
 *    variável ausente causaria falha em um endpoint já em produção.
 *  - Fornecer um objeto `env` imutável (`as const`) que funciona como
 *    "fonte única da verdade" para todas as configurações do sistema,
 *    eliminando a leitura esparsa de `process.env` pelo código.
 *
 * Estratégia de validação:
 *  - `getRequiredEnv`: garante que a variável existe e não é vazia.
 *  - `getStrongSecretEnv`: além de existir, impõe comprimento mínimo e rejeita
 *    valores placeholder como "change_me" (anti-padrão comum em templates).
 *  - Validações semânticas: inteiros positivos para TTLs, enum válido para
 *    SameSite e coerência entre SameSite=None e Secure.
 */

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

/**
 * Retorna o valor de uma variável de ambiente lançando `ValidationError`
 * caso ela não exista ou esteja em branco. Usado para variáveis sem as
 * quais a API não pode inicializar com segurança.
 */
function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new ValidationError(`Variável de ambiente obrigatória não definida: ${name}`);
    }

    return value;
}

/**
 * Especialização de `getRequiredEnv` para segredos criptográficos
 * (JWT_SECRET, PASSWORD_PEPPER, etc.). Rejeita valores fracos ou placeholders
 * para evitar chutes fáceis em ambiente de produção.
 *
 * @param name       Nome da variável de ambiente.
 * @param minLength  Comprimento MÍNIMO em caracteres (padrão NIST: >= 32).
 */
function getStrongSecretEnv(name: string, minLength: number = 32): string {
    const value = getRequiredEnv(name);

    if (value.length < minLength || value.toLowerCase().includes("change_me")) {
        throw new Error(
            `A variável de ambiente ${name} deve ter pelo menos ${minLength} caracteres e não deve conter "change_me".`
        );
    }
    return value;
}

/**
 * Flag de ambiente — determinada exclusivamente por `NODE_ENV=production`.
 * Usada para habilitar cookies seguros, logs estruturados, etc.
 */
const isProduction = process.env.NODE_ENV === "production";

/**
 * Tempo de vida (em DIAS) de um refresh token antes de exigir novo login completo.
 * Lido de `REFRESH_TOKEN_TTL_DAYS` (padrão: 30 dias).
 */
const refreshTokenTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;

/**
 * Idade máxima (em SEGUNDOS) do cookie HTTP-only do access token.
 * Padrão: 1800s = 30 minutos (conforme JWT exp).
 */
const accessTokenCookieMaxAgeSec = Number(process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_SEC) || 1800;

/**
 * Idade máxima (em SEGUNDOS) do cookie HTTP-only do refresh token.
 * Por padrão coincide com `refreshTokenTtlDays` convertido para segundos.
 */
const refreshTokenCookieMaxAgeSec = Number(
    process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_SEC ?? String(refreshTokenTtlDays * 24 * 60 * 60)
);

/**
 * Atributo `SameSite` do cookie de autenticação.
 *   - Produção: "none" (exige HTTPS cross-site, típico de deploy Vercel + domínios separados).
 *   - Desenvolvimento: "lax" (permite cookies em localhost sem HTTPS).
 * Pode ser sobrescrito explicitamente via `AUTH_COOKIE_SAME_SITE`.
 */
const rawAuthCookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE ?? (isProduction ? "none" : "lax"))
    .trim()
    .toLowerCase();

/**
 * Atributo `Secure` dos cookies de autenticação.
 *   - Quando SAME_SITE=none, Secure é OBRIGATÓRIO (especificação RFC 6265bis).
 *   - Em produção, default = true.
 */
const authCookieSecure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE.trim().toLowerCase() === "true"
    : isProduction;

/* --------------------------------------------------------------------------
 * VALIDAÇÕES SEMÂNTICAS — executadas uma única vez no load-time do módulo
 * -------------------------------------------------------------------------- */

if (!Number.isInteger(refreshTokenTtlDays) || refreshTokenTtlDays <= 0) {
    throw new Error("REFRESH_TOKEN_TTL_DAYS inválido! Deve ser um número inteiro positivo.");
}

if (
    !Number.isInteger(accessTokenCookieMaxAgeSec) ||
    accessTokenCookieMaxAgeSec <= 0 ||
    !Number.isInteger(refreshTokenCookieMaxAgeSec) ||
    refreshTokenCookieMaxAgeSec <= 0
) {
    throw new Error("Configuração de expiração de cookie inválida! Deve ser um número inteiro positivo.");
}

if (!["lax", "strict", "none"].includes(rawAuthCookieSameSite)) {
    throw new Error("AUTH_COOKIE_SAMESITE inválido. Use lax, strict ou none.");
}

// RFC 6265bis: SameSite=None só é permitido quando o atributo Secure também está presente.
if (rawAuthCookieSameSite === "none" && !authCookieSecure) {
    throw new Error("AUTH_COOKIE_SAMESITE=none exige AUTH_COOKIE_SECURE=true.");
}

/**
 * Objeto exportado com todas as variáveis validadas e tipadas como
 * readonly (`as const`) para evitar mutação acidental.
 * Qualquer módulo da aplicação deve usar `import { env } from "../config/env.js"`
 * em vez de acessar `process.env` diretamente.
 */
export const env = {
    // --- Servidor ---
    port: process.env.PORT || "8000",

    // --- Segurança / Criptografia ---
    jwtSecret: getStrongSecretEnv("JWT_SECRET"),
    passwordPepper: getStrongSecretEnv("PASSWORD_PEPPER"),
    jwtIssuer: getRequiredEnv("JWT_ISSUER"),
    jwtAudience: getRequiredEnv("JWT_AUDIENCE"),

    // --- Tempos de vida ---
    refreshTokenTtlDays,

    // --- Ambiente ---
    isProduction,

    // --- Cookies de autenticação ---
    authCookiesEnabled: process.env.AUTH_COOKIES_ENABLED === "true",
    accessTokenCookieName: process.env.ACCESS_TOKEN_COOKIE_NAME?.trim() || "access_token",
    refreshTokenCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME?.trim() || "refresh_token",
    accessTokenCookieMaxAgeSec,
    refreshTokenCookieMaxAgeSec,
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
    rawAuthCookieSameSite,
    authCookieSecure,
} as const;
