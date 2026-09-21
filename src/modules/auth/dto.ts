/**
 * Definições de DTO, schemas de validação e contratos de resposta do módulo
 * de autenticação (`auth`).
 *
 * Papéis:
 *   - `loginSchema` / `refreshTokenSchema`  : schemas Zod usados pelo
 *     middleware `validate` para garantir entrada correta nos endpoints.
 *   - `LoginDTO`, `RefreshTokenDTO`         : tipos derivados do schema
 *     (`z.infer`) — usados pelo service para evitar duplicação de tipagem.
 *   - `TokenResponse`, `LogoutResponse`     : formato das respostas HTTP
 *     devolvidas pelo controller.
 */

import { z } from "zod";

/**
 * Schema de login. Valida login (3-100 chars) e senha (6-255 chars).
 * Nota: o limite mínimo de 6 caracteres para senha aqui é propositalmente
 * flexível (apenas um sanity check); a política forte de criação fica em
 * `users/dto.ts → createUserSchema (8 chars)`. Permitir 6 aqui evita
 * bloquear contas antigas criadas com política anterior.
 */
export const loginSchema = z.object({
    login: z.string({ message: "Login é obrigatório." })
        .trim()
        .min(3, { message: "Login deve ter pelo menos 3 caracteres." })
        .max(100, { message: "Login deve ter no máximo 100 caracteres." })
        .optional(),
    email: z.string({ message: "Email é obrigatório." })
        .trim()
        .email({ message: "Email inválido." })
        .max(200, { message: "Email deve ter no máximo 200 caracteres." })
        .optional(),
    senha: z.string({ message: "Senha é obrigatória." })
        .trim()
        .min(6, { message: "Senha deve ter pelo menos 6 caracteres." })
        .max(255, { message: "Senha deve ter no máximo 255 caracteres." }),
}).refine((value) => Boolean(value.login || value.email), {
    message: "Informe login ou email para autenticar.",
    path: ["login"],
});

export type LoginDTO = z.infer<typeof loginSchema> & {
    login?: string;
    email?: string;
    senha: string;
};

/**
 * Schema de refresh. O `refresh_token` é opcional no BODY pois pode ser
 * lido automaticamente do cookie `refresh_token` quando `authCookiesEnabled`.
 */
export const refreshTokenSchema = z.object({
    refresh_token: z.string().trim().min(10, { message: "Refresh token inválido." })
        .optional(),
});

export type RefreshTokenDTO = z.infer<typeof refreshTokenSchema>;

/**
 * Contrato de resposta de emissão/renovação de tokens (RFC 6749 "Bearer Token
 * Response" com adição do refresh_token em nosso payload).
 */
export interface TokenResponse {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    refresh_token?: string;
}

export interface LogoutResponse {
    message: string;
}
