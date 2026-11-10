/**
 * Helpers de formatação de resposta HTTP padronizada.
 *
 * Objetivo:
 *   Nenhum controller deve montar manualmente um JSON. Sempre use estes
 *   helpers para garantir que:
 *     - A estrutura do envelope sempre corresponde a `HttpResponse<T>`.
 *     - Códigos de status são consistentes (200, 201, 204, 4xx…).
 *
 * Convenções seguidas:
 *   - 200 OK       → `success()`
 *   - 201 Created  → `created()`
 *   - 204 No Content→ `noContent()` (sem body, `send()` vazio)
 *   - 4xx/5xx      → `fail()` (estrutura de erro)
 */

import type { Response } from "express";
import type { HttpResponse } from "./response.js";

/**
 * Resposta de sucesso genérica.
 * @param res        Response do Express.
 * @param data       Dados úteis (tipados) a serem serializados.
 * @param statusCode HTTP status (padrão 200 OK).
 */
export function success<T>(
    res: Response,
    data: T,
    statusCode: number = 200
): void {
    const body: HttpResponse<T> = {
        status: "success",
        data,
    };
    res.status(statusCode).json(body);
}

/**
 * Sucesso com 201 Created. Conveniência para `POST` de criação.
 */
export function created<T>(
    res: Response,
    data: T,
    statusCode: number = 201
): void {
    success(res, data, statusCode);
}

/**
 * 204 No Content — **não** escreve body no response.
 * Usado em endpoints de `DELETE` ou `PATCH` que não devolvem nada útil.
 */
export function noContent(res: Response): void {
    res.status(204).send();
}

/**
 * Resposta de falha de domínio (ex.: 400, 404, 409, 422).
 * Diferencia-se do middleware global `errorHandler` por aceitar um
 * payload `data` opcional (ex.: lista de erros de validação).
 *
 * @param res        Response do Express.
 * @param message    Mensagem amigável para o cliente.
 * @param statusCode Código HTTP de erro (4xx tipicamente).
 * @param data       Detalhes extras (ex.: `{ erros: [...] }`).
 */
export function fail(
    res: Response,
    message: string,
    statusCode: number = 400,
    data?: unknown
): void {
    const body: HttpResponse<unknown> = {
        status: "error",
        message,
        data,
    };
    res.status(statusCode).json(body);
}
