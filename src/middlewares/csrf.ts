import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { isAllowedOrigin } from "../config/cors.js";

function hasAuthenticationCookie(req: Request): boolean {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return false;
    const names = new Set(cookieHeader.split(";").map((cookie) => cookie.trim().split("=", 1)[0]));
    return names.has(env.accessTokenCookieName) || names.has(env.refreshTokenCookieName);
}

export function protectCookieRequests(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const origin = req.get("origin");
    const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());
    if (origin && !isAllowedOrigin(origin)) {
        res.status(403).json({ status: "error", message: "Origem não permitida." });
        return;
    }
    if (unsafeMethod && hasAuthenticationCookie(req) && (!origin || !isAllowedOrigin(origin))) {
        res.status(403).json({ status: "error", message: "A origem da solicitação não foi validada." });
        return;
    }
    next();
}
