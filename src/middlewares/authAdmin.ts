/**
 * Middleware de AUTORIZAÇÃO baseado em perfil (RBAC — Role-Based Access Control).
 *
 * Importante: Diferencia-se do middleware `autenticarToken` (que responde "QUEM
 * é o usuário"); este responde "O QUE o usuário está autorizado a fazer".
 *
 * Perfil "sakai" = super-administrador da aplicação. Qualquer outro nível
 * (admin / gestor / usuário) recebe 403 Forbidden.
 *
 * Para autorizações mais granulares (ex.: "gestor pode ver mas não apagar"),
 * este middleware deve ser substituído por um middleware parametrizável do tipo
 * `requirePerfil("admin")` (onde admin OU sakai passam) ou por políticas de
 * permissões (caso de uso que ainda não surgiu no domínio).
 */

import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";

export function authAdmin(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Response | void {
    // Caso este middleware seja encadeado ANTES de `autenticarToken`.
    if (!req.user) {
        return res.status(401).json({ message: "Usuário não autenticado." });
    }

    if (req.user.classificacao !== "sakai") {
        return res.status(403).json({
            message: "Acesso negado. Apenas usuários administradores podem acessar este recurso."
        });
    }

    next();
}
