/**
 * Middleware de autenticação via JWT (JSON Web Token).
 *
 * Fluxo de obtenção do token (por ORDEM de preferência):
 *   1. Cabeçalho HTTP `Authorization: Bearer <access_token>`
 *   2. Cookie HTTP-only `access_token` (fallback, quando cookies estão habilitados)
 *
 * Após a validação, o payload decodificado é anexado em `req.user` do Express,
 * ficando disponível para todos os handlers seguintes.
 *
 * Implementa também a verificação de JTI revogado (blacklist de tokens
 * manual/invalidação de sessão). Atualmente `banco.tokenRevogado()` é um stub
 * que sempre retorna `false`; quando a tabela de blacklist existir, este
 * middleware já está pronto para usá-la sem alterações na interface.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { banco } from "../database/connection.js";

/**
 * Estrutura tipada do payload contido em um access token JWT emitido pela API.
 * Campos:
 *   - `id`            : PK numérica do usuário.
 *   - `userLogin`     : login do usuário (campo `login` na tabela de usuários).
 *   - `classificacao` : perfil de autorização (sakai | admin | gestor | usuario).
 *   - `jti`           : identificador ÚNICO do token — usado para blacklist/logout.
 *   - `exp`           : timestamp UNIX em segundos da expiração do access token.
 */
export interface TokenPayload {
    id: number;
    userLogin: string;
    classificacao: string;
    jti: string;
    exp: number;
}

/**
 * Tipo auxiliar extendendo o `Request` padrão do Express com o usuário
 * autenticado. Usado nos controllers e middlewares dependentes de auth.
 */
export interface AuthRequest extends Request {
    user?: TokenPayload;
}

/* --------------------------------------------------------------------------
 * Helpers locais de leitura de variáveis de ambiente (mantidos aqui para
 * evitar dependência circular com config/env.ts — middlewares são
 * geralmente os primeiros arquivos carregados em alguns setup).
 * -------------------------------------------------------------------------- */

function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
    return value;
}

function getStrongSecretEnv(name: string, minLength = 32): string {
    const value = getRequiredEnv(name);

    if (value.length < minLength || value.toLowerCase().includes("change_me")) {
        throw new Error(
            `Variável ${name} fraca. Use um segredo com pelo menos ${minLength} caracteres aleatórios.`
        );
    }

    return value;
}

/**
 * Segredo HMAC-SHA256 usado para VERIFICAR a assinatura dos access tokens.
 * Mesmo valor que `env.jwtSecret` em `config/env.ts`.
 */
const secret = getStrongSecretEnv("JWT_SECRET");

/**
 * Issuer esperado (`iss` claim). Qualquer token emitido por outro emissor
 * é rejeitado como 403 Forbidden.
 */
const jwtIssuer = getRequiredEnv("JWT_ISSUER");

/**
 * Audience esperada (`aud` claim). Evita cross-contaminação entre serviços
 * que compartilham a mesma chave JWT.
 */
const jwtAudience = getRequiredEnv("JWT_AUDIENCE");

/**
 * Nome do cookie HTTP-only onde o access token pode ser armazenado.
 */
const accessTokenCookieName = process.env.ACCESS_TOKEN_COOKIE_NAME?.trim() || "access_token";

/**
 * Normaliza um valor de cabeçalho que pode ser string ou array (alguns
 * proxies repetem cabeçalhos) em uma única string.
 */
function getHeaderString(value: string | string[] | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    return Array.isArray(value) ? value[0] : value;
}

/**
 * Realiza o parse manual do header `Cookie`, retornando um mapa chave/valor
 * de todos os cookies presentes. Implementamos manualmente (em vez de
 * `cookie-parser`) para manter a camada de auth leve e sem dependências extras.
 */
function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) {
        return {};
    }

    return cookieHeader
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, pair) => {
            const separatorIndex = pair.indexOf("=");

            if (separatorIndex <= 0) {
                return acc;
            }

            const key = pair.slice(0, separatorIndex).trim();
            const value = pair.slice(separatorIndex + 1).trim();

            if (!key) {
                return acc;
            }

            try {
                // Cookies podem ter caracteres especiais percent-encoded.
                acc[key] = decodeURIComponent(value);
            } catch {
                acc[key] = value;
            }

            return acc;
        }, {});
}

/**
 * Estratégia de extração do access token conforme ordem acima.
 * Retorna `null` caso nenhum token seja encontrado.
 */
function extractAccessToken(req: Request): string | null {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        if (token) {
            return token;
        }
    }

    const cookieHeader = getHeaderString(req.headers.cookie);
    const cookies = parseCookieHeader(cookieHeader);
    const cookieToken = cookies[accessTokenCookieName];
    return cookieToken ? cookieToken.trim() : null;
}

/**
 * Middleware principal de autenticação.
 *
 * Respostas possíveis:
 *   - `401 Unauthorized`  : nenhum token enviado ou token cujo jti foi revogado.
 *   - `403 Forbidden`     : token inválido (assinatura errada, expirado,
 *                           claims incorretos, formato inválido).
 *   - `next()`            : autenticação OK; `req.user` populado.
 */
export async function autenticarToken(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<Response | void> {
    const token = extractAccessToken(req);

    if (!token) {
        return res.sendStatus(401);
    }

    try {
        // Verifica assinatura + expiração + issuer + audience em uma única operação.
        const decoded = jwt.verify(token, secret, {
            algorithms: ["HS256"],
            issuer: jwtIssuer,
            audience: jwtAudience,
        }) as jwt.JwtPayload & TokenPayload;

        // Extrai e valida claims obrigatórias do payload interno.
        const jti = typeof decoded.jti === "string" ? decoded.jti : "";
        const exp = Number(decoded.exp);

        if (!jti || !Number.isFinite(exp) || exp <= 0) {
            return res.sendStatus(403);
        }

        // Verifica se o token foi explicitamente revogado (logout global).
        const revogado = await banco.tokenRevogado(jti);

        if (revogado) {
            return res.sendStatus(401);
        }

        // Anexa o usuário autenticado ao request.
        req.user = {
            id: Number(decoded.id),
            userLogin: String(decoded.userLogin),
            classificacao: decoded.classificacao,
            jti,
            exp,
        };
        next();
    } catch {
        // Qualquer erro de verificação (assinatura, exp, malformado) → 403.
        return res.sendStatus(403);
    }
}
