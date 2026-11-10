/**
 * Controller HTTP do módulo de Autenticação.
 *
 * Responsabilidades do Controller:
 *   - Extrai dado tipado do request (`validatedBody` etc.).
 *   - Chama métodos do `authService` (regras de negócio).
 *   - Aplica cookies HTTP-only de autenticação quando o modo cookie está ligado.
 *   - Serializa a resposta usando os helpers de `shared/http/success`.
 *   - Propaga qualquer `AppError` ou erro inesperado via `next(error)` para o
 *     middleware global `errorHandler`.
 */

import type { Request, Response, NextFunction } from "express";
import { authService } from "./service.js";
import { success, noContent, fail } from "../../shared/http/success.js";
import { validatedBody } from "../../middlewares/validate.js";
import type { LoginDTO, LoginCodigoDTO, RefreshTokenDTO, TokenResponse } from "./dto.js";
import { env } from "../../config/env.js";
import type { AuthRequest, TokenPayload } from "../../middlewares/auth.js";

/**
 * Helper: parseia o header `Cookie: a=b; c=d` manualmente (sem cookie-parser).
 * Retorna mapa chave/valor dos cookies encontrados no request atual.
 */
function extrairCookies(req: Request): Record<string, string> {
    const header = req.headers.cookie;
    if (!header || typeof header !== "string") {
        return {};
    }
    return header
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, pair) => {
            const idx = pair.indexOf("=");
            if (idx <= 0) return acc;
            const k = pair.slice(0, idx).trim();
            const v = pair.slice(idx + 1).trim();
            if (!k) return acc;
            try {
                acc[k] = decodeURIComponent(v);
            } catch {
                acc[k] = v;
            }
            return acc;
        }, {});
}

/**
 * Injetor de cookies de autenticação (HTTP-only). Só atua quando
 * `env.authCookiesEnabled === true`.
 */
function aplicarCookiesTokens(res: Response, token: TokenResponse): void {
    if (!env.authCookiesEnabled) return;

    const cookieCommon = {
        httpOnly: true,
        secure: env.authCookieSecure,
        sameSite: env.rawAuthCookieSameSite as "lax" | "strict" | "none",
        domain: env.authCookieDomain,
    } as const;

    res.cookie(env.accessTokenCookieName, token.access_token, {
        ...cookieCommon,
        maxAge: env.accessTokenCookieMaxAgeSec * 1000,
    });

    if (token.refresh_token) {
        res.cookie(env.refreshTokenCookieName, token.refresh_token, {
            ...cookieCommon,
            maxAge: env.refreshTokenCookieMaxAgeSec * 1000,
        });
    }
}

/**
 * Remove os cookies de autenticação do cliente (chamado no logout).
 */
function limparCookiesAuth(res: Response): void {
    const domain = env.authCookieDomain ? { domain: env.authCookieDomain } : {};
    res.clearCookie(env.accessTokenCookieName, domain);
    res.clearCookie(env.refreshTokenCookieName, domain);
}

export const authController = {
    /**
     * `POST /api/auth/login`
     * Valida credenciais (e-mail e senha OU código do colaborador) → emite tokens.
     */
    async login(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const dto = validatedBody<LoginDTO>(req);
            const token = await authService.autenticar(dto);
            aplicarCookiesTokens(res, token);
            success(res, token, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * `POST /api/auth/login/codigo`
     * Endpoint dedicado para login por código do colaborador.
     */
    async loginCodigo(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const dto = validatedBody<LoginCodigoDTO>(req);
            const token = await authService.autenticarPorCodigo(dto);
            aplicarCookiesTokens(res, token);
            success(res, token, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * `POST /api/auth/refresh`
     * Recebe refresh token (1° body, 2° cookie) → devolve novo access token.
     */
    async refresh(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const baseBody = validatedBody<Partial<RefreshTokenDTO>>(req) ?? {};
            const cookies = extrairCookies(req);
            const bodyComCookie: RefreshTokenDTO = {
                ...baseBody,
                refresh_token:
                    baseBody.refresh_token ?? cookies[env.refreshTokenCookieName],
            };
            const token = await authService.renovarToken(bodyComCookie);
            aplicarCookiesTokens(res, token);
            success(res, token, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * `POST /api/auth/logout`
     * Notifica o service e limpa cookies.
     */
    async logout(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const authReq = req as AuthRequest;
            const jti = authReq.user?.jti;
            await authService.logout(jti);
            limparCookiesAuth(res);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },

    /**
     * `GET /api/auth/me`
     * Retorna o payload `TokenPayload` do usuário autenticado.
     */
    async eu(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const authReq = req as AuthRequest;
            const usuario = authReq.user as TokenPayload | undefined;
            if (!usuario) {
                fail(res, "Usuário não autenticado.", 401);
                return;
            }
            success(res, usuario, 200);
        } catch (error) {
            next(error);
        }
    },
};

export default authController;
