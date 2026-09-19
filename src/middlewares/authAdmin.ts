import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

export function authAdmin(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {

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