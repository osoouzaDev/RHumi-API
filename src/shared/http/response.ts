/**
 * Tipos compartilhados de transporte HTTP da API.
 *
 * Inclui:
 *   - `HttpResponse<T>`: envelope padrão de resposta. Toda resposta da API
 *     (sucesso OU erro) é um JSON com pelo menos o campo `status`. Isso
 *     permite que o frontend trate o retorno de forma uniforme.
 *   - `AuthenticatedRequest`: extensão de `Request` usada em rotas que
 *     carregam `requestId` (log distribuído) e `rawBody` (ex.: webhooks
 *     cuja assinatura HMAC depende do payload original antes do JSON parse).
 */

import type { Request } from "express";

/**
 * Envelope de resposta. Campos:
 *   - `status` = "success" | "error" — permite discriminação rápida no client.
 *   - `data`   = payload útil (presente em sucesso, opcional em erro).
 *   - `message` = descrição de erro (presente em erro, ausente em sucesso puro).
 */
export interface HttpResponse<T> {
    status: "success" | "error";
    data?: T;
    message?: string;
}

/**
 * `Request` extendido para identificadores de correlação e webhooks.
 */
export interface AuthenticatedRequest extends Request {
    /** UUID correlacionado ao request para tracing em logs distribuídos. */
    requestId?: string;
    /** String bruta do body (webhooks Kommo — assinatura HMAC). */
    rawBody?: string;
}
