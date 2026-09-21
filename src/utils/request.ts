/**
 * Middleware utilitário — injeção de `requestId` para tracing distribuído.
 *
 * Fluxo:
 *   1. Verifica se o client já enviou um `X-Request-Id` (ex.: reverse proxy,
 *      API gateway, Kommo webhook). Se sim, reaproveita para manter
 *      correlação ponta-a-ponta.
 *   2. Caso contrário, gera um `crypto.randomUUID()` (RFC 4122) novo.
 *   3. Anexa tanto `requestId` quanto um placeholder `rawBody` ao `Request`.
 *
 * Esse requestId pode ser incluído em todos os logs (Pino) e propagado em
 * headers de resposta para debug do frontend.
 */

import type { Request, Response, NextFunction } from "express";

/** Tipo extendido do Request com os campos que este middleware injeta. */
export interface RequestWithId extends Request {
    requestId?: string;
    rawBody?: string;
}

export function attachRequestId(
    req: RequestWithId,
    _res: Response,
    next: NextFunction
): void {
    // Reaproveita ID vindo de camadas anteriores (gateway, load balancer) …
    const existingId = req.headers["x-request-id"];
    // … senão gera um UUID v4 novo em nível de aplicação.
    req.requestId = (typeof existingId === "string" ? existingId : undefined) || crypto.randomUUID();
    next();
}
