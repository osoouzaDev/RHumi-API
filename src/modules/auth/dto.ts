/**
 * Definições de DTO, schemas de validação e contratos de resposta do módulo
 * de autenticação (`auth`).
 *
 * Papéis:
 *   - `loginEmailSenhaSchema`: schema para autenticação tradicional por email/login e senha.
 *   - `loginCodigoSchema`: schema para autenticação por código do colaborador.
 *   - `loginSchema`: schema unificado que aceita ou email+senha ou código do colaborador.
 *   - `refreshTokenSchema`: schema Zod para renovação de access tokens.
 *   - `TokenResponse`, `LogoutResponse`: formato das respostas HTTP devolvidas pelo controller.
 */

import { z } from "zod";

/**
 * Schema de autenticação tradicional (email ou login + senha).
 * Valida login (3-100 chars) ou email e senha (6-255 chars).
 */
export const loginEmailSenhaSchema = z.object({
    login: z.string({ message: "Login deve ser uma string." })
        .trim()
        .min(3, { message: "Login deve ter pelo menos 3 caracteres." })
        .max(100, { message: "Login deve ter no máximo 100 caracteres." })
        .optional(),
    email: z.string({ message: "Email deve ser uma string." })
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
    path: ["email"],
});

export type LoginEmailSenhaDTO = z.infer<typeof loginEmailSenhaSchema> & {
    login?: string;
    email?: string;
    senha: string;
};

/**
 * Schema de autenticação por código do colaborador.
 *
 * O código do colaborador corresponde ao código numérico de quatro dígitos
 * cadastrado na tabela `usuario`.
 */
export const loginCodigoSchema = z.object({
    codigo_colaborador: z.string({ message: "Código do colaborador é obrigatório." })
        .trim()
        .regex(/^\d{4}$/, { message: "O código do colaborador deve ter exatamente 4 dígitos." }),
});

export type LoginCodigoDTO = z.infer<typeof loginCodigoSchema>;

/**
 * Schema unificado para POST /api/auth/login.
 * Aceita tanto e-mail e senha quanto código do colaborador.
 */
export const loginSchema = z.union([
    loginEmailSenhaSchema,
    loginCodigoSchema,
], {
    message: "Informe e-mail e senha ou o código do colaborador para autenticar.",
});

export type LoginDTO =
    | ({ email?: string; login?: string; senha: string; codigo_colaborador?: never })
    | ({ codigo_colaborador: string; email?: never; login?: never; senha?: never });

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
