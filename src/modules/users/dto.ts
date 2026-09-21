/**
 * Definições de domínio do módulo `users`.
 *
 * Contém:
 *   - Enum `classificacaoEnum` (RBAC: sakai/admin/gestor/usuario).
 *   - Schemas Zod de validação de entrada para cada operação (CRUD + listagem).
 *   - Interfaces `Usuario` (público), `UsuarioComSenha` (privado com hash),
 *     `PaginatedResponse<T>` (envelope para listas paginadas).
 */

import { z } from "zod";

/**
 * Perfis de autorização RBAC em ordem hierárquica.
 *   - sakai   : Super-administrador (dono do sistema).
 *   - admin   : Administrador, pode criar/editar usuários etc.
 *   - gestor  : Gerente de setor, permissões intermediárias (a definir).
 *   - usuario : Usuário final, permissões mínimas.
 */
export const classificacaoEnum = z.enum([
    "sakai",
    "admin",
    "gestor",
    "usuario",
    "HR_ADMIN",
    "SUPERVISOR",
    "EMPLOYEE",
    "CANDIDATE",
], {
    message: "Classificação deve ser um perfil válido do sistema RHumi.",
});

export type Classificacao = z.infer<typeof classificacaoEnum>;

/**
 * Schema para criação de usuário (POST /usuários).
 * Requer login, nome, email, senha (mínimo 8 chars). Defaults:
 * classificacao = "usuario", ativo = true.
 */
export const createUserSchema = z.object({
    login: z.string({ message: "Login é obrigatório." })
        .trim()
        .min(3, { message: "Login deve ter pelo menos 3 caracteres." })
        .max(100, { message: "Login deve ter no máximo 100 caracteres." }),
    nome: z.string({ message: "Nome é obrigatório." })
        .trim()
        .min(2, { message: "Nome deve ter pelo menos 2 caracteres." })
        .max(200, { message: "Nome deve ter no máximo 200 caracteres." }),
    email: z.string({ message: "Email é obrigatório." })
        .trim()
        .email({ message: "Email inválido." })
        .max(200, { message: "Email deve ter no máximo 200 caracteres." }),
    senha: z.string({ message: "Senha é obrigatória." })
        .trim()
        .min(8, { message: "Senha deve ter pelo menos 8 caracteres." })
        .max(255, { message: "Senha deve ter no máximo 255 caracteres." }),
    classificacao: classificacaoEnum.default("usuario"),
    ativo: z.boolean().default(true),
});

export type CreateUserDTO = z.infer<typeof createUserSchema>;

/**
 * Schema para atualização parcial de usuário (PUT /usuários/:id).
 * Todos os campos são opcionais — apenas os enviados serão alterados.
 */
export const updateUserSchema = z.object({
    nome: z.string()
        .trim()
        .min(2, { message: "Nome deve ter pelo menos 2 caracteres." })
        .max(200, { message: "Nome deve ter no máximo 200 caracteres." })
        .optional(),
    email: z.string()
        .trim()
        .email({ message: "Email inválido." })
        .max(200, { message: "Email deve ter no máximo 200 caracteres." })
        .optional(),
    classificacao: classificacaoEnum.optional(),
    ativo: z.boolean().optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;

/**
 * Schema para alteração de senha.
 * Requer senha atual (para confirmação) e nova senha (>= 8 chars).
 */
export const updateUserPasswordSchema = z.object({
    senha_atual: z.string({ message: "Senha atual é obrigatória." })
        .trim()
        .min(6, { message: "Senha atual inválida." }),
    nova_senha: z.string({ message: "Nova senha é obrigatória." })
        .trim()
        .min(8, { message: "Nova senha deve ter pelo menos 8 caracteres." })
        .max(255, { message: "Nova senha deve ter no máximo 255 caracteres." }),
});

export type UpdateUserPasswordDTO = z.infer<typeof updateUserPasswordSchema>;

/**
 * Schema de params para rotas `/usuarios/:id`.
 * Garante ID numérico inteiro positivo (> 0).
 */
export const userIdParamsSchema = z.object({
    id: z.string()
        .trim()
        .min(1, { message: "ID é obrigatório." })
        .refine((v) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v), {
            message: "ID deve ser um UUID válido.",
        }),
});

export type UserIdParams = z.infer<typeof userIdParamsSchema>;

/**
 * Query string para listagem paginada (GET /usuarios?).
 * Campos aceitos:
 *   - pagina     : 1..N (padrão 1).
 *   - por_pagina : 1..100 (padrão 20).
 *   - busca      : termo livre (procura em login/nome/email).
 *   - classificacao : filtra por perfil.
 *   - ativo      : "true" | "false" | "" → boolean | undefined.
 */
export const listUsersQuerySchema = z.object({
    pagina: z.string()
        .optional()
        .refine((v) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 1), {
            message: "pagina deve ser um número inteiro >= 1.",
        })
        .transform((v) => (v ? Number(v) : 1)),
    por_pagina: z.string()
        .optional()
        .refine((v) => v === undefined || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 100), {
            message: "por_pagina deve ser um número inteiro entre 1 e 100.",
        })
        .transform((v) => (v ? Number(v) : 20)),
    busca: z.string().trim().max(100).optional(),
    classificacao: classificacaoEnum.optional(),
    ativo: z.enum(["true", "false", ""]).optional()
        .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * DTO público do Usuário (NÃO contém `senha_hash`).
 * Usado em todas as respostas de listagem/detalhe/atualização.
 */
export interface Usuario {
    id: string;
    login: string;
    nome: string;
    email: string;
    classificacao: Classificacao;
    ativo: boolean;
    data_criacao: string;
    data_atualizacao: string;
}

/**
 * Extensão do DTO que INCLUI o hash da senha. Nunca retornar este objeto
 * em endpoints — uso exclusivo da camada de autenticação/service.
 */
export interface UsuarioComSenha extends Usuario {
    senha_hash: string;
}

/**
 * Envelope de paginação padrão.
 *   - dados : array tipado de registros da página atual.
 *   - meta  : informações de paginação (total, total_paginas, etc.).
 */
export interface PaginatedResponse<T> {
    dados: T[];
    meta: {
        pagina: number;
        por_pagina: number;
        total: number;
        total_paginas: number;
    };
}
