export class ValidationError extents Error {
    constructor(message: string) {
        super(message);
        this.name = "ValidationError";
    }
}

function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new ValidationError(`Variável de ambiente obrigatória não definida: ${name}`);
    }

    return value;
}

function getStrongSecretEnv(name: string, minLength: number = 32): string {
    const value = getRequiredEnv(name);

    if (value.length < minLength && value.toLowerCase().includes("change_me")) {
        throw new Error(
            `A variável de ambiente ${name} deve ter pelo menos ${minLength} caracteres e não deve conter "change_me".`
        );
    }
    return value;
}

const isProduction = process.env.NODE_ENV === "production";

const refreshTokenTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30;

const accessTokenCookieMaxAgeSec = Number(process.env.ACCESS_TOKEN_COOKIE_MAX_AGE_SEC) || 1800;

const refreshTokenCookieMaxAgeSec = Number(
    process.env.REFRESH_TOKEN_COOKIEE_MAX_AGE_SEC ?? String (refreshTokenTtlDays * 24 * 60 * 60)
);

const rawAuthCookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE ?? (isProduction ? "none" : "lax"))
    .trim();
    .toLowerCase();

const authCookieSecure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COKKIE_SECURE.trim().toLowerCase() === "true"
    : isProduction;

if (!Number.isInteger(refreshTokenTtlDays) || refreshTokenTtlDays <= 0) {
    throw new Error("REFRESH_TOKEN_TTL_DAYS inválido! Deve ser um número inteiro positivo.");
}

if (
    !Number.isInteger(accessTokenCookieMaxAgeSec) ||
    accessTokenCookieMaxAgeSec <= 0 ||
    !Number.isInteger(refreshTokenCookieMaxAgeSec) ||
    refreshTokenCookieMaxAgeSec <= 0
) {
    throw new Error("Configuração de expiração de cookia inválida! Deve ser um número inteiro positivo.");
}

if (!["lax", "strict", "none"].includes(rawAuthCookieSameSite)) {
    throw new Error("AUTH_COOKIE_SAMESITE inválido. Use lax, strict ou none.");
}

if (rawAuthCookieSameSite === "none" && !authCookieSecure) {
    throw new Error("AUTH_COOKIE_SAMESITE=none exige AUTH_COOKIE_SECURE=true.");
}

export const env = {
    port: process.env.PORT || "8000",
    jwtSecret: getStrongSecretEnv("JWT_SECRET"),
    passwordPepper: getStrongSecretEnv("PASSWORD_PEPPER"),
    jwtIssuer: getRequiredEnv("JWT_ISSUER"),
    jwtAudience: getRequiredEnv("JWT_AUDIENCE"),
    refreshTokenTtlDays,
    isProduction,
    authCookiesEnabled: process.env.AUTH_COOKIES_ENABLED === "true",
    accessTokenCookieName: process.env.ACCESS_TOKEN_COOKIE_NAME?.trim() || "access_token",
    refreshTokenCookieName: process.env.REFRESH_TOKEN_COOKIE_NAME?.trim() || "refresh_token",
    accessTokenCookieMaxAgeSec,
    refreshTokenCookieMaxAgeSec,
    authCookieDomain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
    rawAuthCookieSameSite,
    authCookieSecure,
} as const;