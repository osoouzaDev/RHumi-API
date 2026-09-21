/**
 * Middleware GLOBAL de tratamento centralizado de erros do Express.
 *
 * Regra da assinatura `(err, req, res, next)`: **4 parâmetros obrigatórios**.
 * O Express diferencia middleware de erro de middleware normal pelo `arity`,
 * portanto nunca remova os parâmetros não utilizados (`_req`, `_next`) nem
 * encurte para 3 args.
 *
 * Dois cenários de tratamento:
 *   1. `AppError` (erros de DOMÍNIO / NEGÓCIO, ex.: "Senha incorreta",
 *      "Usuário não encontrado") → responde com `statusCode` customizado.
 *   2. Qualquer outro erro (ex.: erro de driver SQL, referência nula, panico
 *      do Node) → loga stack no console (não expõe detalhes ao cliente) e
 *      responde com **500 Internal Server Error** genérico.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/app-error.js";

export function errorHandler(
    err: Error | AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            status: "error",
            message: err.message,
        });
        return;
    }

    // Erro não tratado — NUNCA exponha `err.message` diretamente ao cliente
    // em produção, pois pode conter caminhos, senhas ou stack trace.
    console.error("[Erro não tratado]:", err);

    res.status(500).json({
        status: "error",
        message: "Erro interno do servidor.",
    });
}
