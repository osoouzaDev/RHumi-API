/**
 * Camada de Acesso a Dados (Data Access Layer - Repositório) para a entidade Usuário e Colaborador.
 *
 * Este módulo implementa o padrão Repository (Fowler, 2002), encapsulando toda a
 * lógica de persistência e recuperação de objetos do domínio `Usuario` e `Colaborador` no SGBD.
 *
 * Finalidade arquitetural (SRP - Single Responsibility Principle):
 * - Isolar a camada de negócios (Service) dos detalhes tecnológicos do mecanismo
 *   de armazenamento (SQL do PostgreSQL, driver pg.Pool, índices, joins).
 * - Permitir a substituição da estratégia de persistência (ex.: mock para testes
 *   unitários) sem impacto na camada de serviço.
 * - Centralizar queries parametrizadas, evitando duplicação e SQL Injection.
 *
 * As tabelas gerenciadas são `public.usuario` e `public.usuario_colaborador`, conforme a migration inicial.
 *
 * Observações de Segurança (OWASP SQL Injection Prevention Cheat Sheet):
 * - Todas as queries reais a serem implementadas DEVEM utilizar parametrização
 *   placeholders (`$1`, `$2`, ...) fornecidas pelo driver `pg`; NUNCA concatenar
 *   strings de entrada do usuário na consulta SQL.
 * - Nunca retornar `senha_hash` em operações de listagem/leitura geral; o campo
 *   só deve ser exposto por `buscarPorLogin()` e um eventual `buscarPorIdComSenha()`
 *   exclusivamente para fins de autenticação e validação de senha atual.
 */

import type {
    Classificacao,
    Usuario,
    UsuarioComSenha,
    CreateUserDTO,
    UpdateUserDTO,
    ListUsersQuery,
    PaginatedResponse,
    UsuarioCriado,
} from "./dto.js";
import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";

function usuarioFromRow(row: Record<string, unknown>): Usuario {
    return {
        id: String(row.id),
        login: String(row.login ?? row.email),
        nome: String(row.nome),
        email: String(row.email),
        classificacao: (row.classificacao as Classificacao) || "HR_ADMIN",
        ativo: Boolean(row.ativo),
        data_criacao: new Date(row.data_criacao as string).toISOString(),
        data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        telefone: row.telefone == null ? null : String(row.telefone),
        setor: row.setor == null ? null : String(row.setor),
        cargo: row.cargo == null ? null : String(row.cargo),
        tipo_contrato: row.tipo_contrato == null
            ? null
            : row.tipo_contrato as NonNullable<Usuario["tipo_contrato"]>,
        data_admissao: row.data_admissao == null ? null : String(row.data_admissao).slice(0, 10),
        descricao_cargo: row.descricao_cargo == null ? null : String(row.descricao_cargo),
    };
}

/**
 * Fachada do repositório de usuários.
 *
 * Implementa um objeto literal (strategy pattern aplicado a DAL) com todos os
 * pontos de contato com as tabelas `usuario` e `usuario_colaborador`.
 */
export const usuariosRepositorio = {
    async listarSetoresPorUsuario(usuarioId: string): Promise<string[]> {
        const result = await banco.query(
            `
                SELECT s.nome_setor
                FROM setor s
                JOIN usuario u ON u.id_empresa = s.id_empresa
                WHERE u.id = $1
                ORDER BY s.nome_setor
            `,
            [usuarioId]
        );

        return result.rows.map((row) => String(row.nome_setor));
    },

    /**
     * Lista usuários com suporte a paginação e filtros por classificação e busca textual.
     */
    async listar(filtros: ListUsersQuery): Promise<PaginatedResponse<Usuario>> {
        const pagina = Number.isFinite(Number(filtros.pagina)) ? Number(filtros.pagina) : 1;
        const porPagina = Number.isFinite(Number(filtros.por_pagina)) ? Number(filtros.por_pagina) : 20;
        const offset = (pagina - 1) * porPagina;
        const busca = filtros.busca || null;
        const classificacao = filtros.classificacao || null;
        const ativo = filtros.ativo ?? null;

        const totalResult = await banco.query(
            `
                SELECT COUNT(*)::int AS total
                FROM usuario u
                LEFT JOIN LATERAL (
                    SELECT uc.classificacao
                    FROM usuario_colaborador uc
                    WHERE uc.id_usuario = u.id OR LOWER(uc.email) = LOWER(u.email)
                    ORDER BY (uc.id_usuario = u.id) IS TRUE DESC, uc.created_at DESC
                    LIMIT 1
                ) uc ON TRUE
                WHERE ($1::boolean IS NULL OR u.ativo = $1)
                  AND ($2::text IS NULL OR COALESCE(uc.classificacao, 'HR_ADMIN') = $2)
                  AND ($3::text IS NULL OR u.nome ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
            `,
            [ativo, classificacao, busca]
        );

        const rowsResult = await banco.query(
            `
                SELECT
                    u.id::text AS id,
                    u.nome,
                    u.email,
                    u.email AS login,
                    COALESCE(uc.classificacao, 'HR_ADMIN')::text AS classificacao,
                    u.ativo,
                    u.created_at AS data_criacao,
                    u.updated_at AS data_atualizacao,
                    COALESCE(uc.telefone, u.telefone) AS telefone,
                    s.nome_setor AS setor,
                    uc.cargo,
                    uc.tipo_contrato,
                    TO_CHAR(uc.data_admissao, 'YYYY-MM-DD') AS data_admissao,
                    uc.descricao_cargo
                FROM usuario u
                LEFT JOIN LATERAL (
                    SELECT colaborador.*
                    FROM usuario_colaborador colaborador
                    WHERE colaborador.id_usuario = u.id OR LOWER(colaborador.email) = LOWER(u.email)
                    ORDER BY (colaborador.id_usuario = u.id) IS TRUE DESC, colaborador.created_at DESC
                    LIMIT 1
                ) uc ON TRUE
                LEFT JOIN setor s ON s.id = uc.id_setor
                WHERE ($1::boolean IS NULL OR u.ativo = $1)
                  AND ($2::text IS NULL OR COALESCE(uc.classificacao, 'HR_ADMIN') = $2)
                  AND ($3::text IS NULL OR u.nome ILIKE '%' || $3 || '%' OR u.email ILIKE '%' || $3 || '%')
                ORDER BY u.created_at DESC
                LIMIT $4 OFFSET $5
            `,
            [ativo, classificacao, busca, porPagina, offset]
        );

        const total = Number(totalResult.rows[0]?.total ?? 0);
        const dados = rowsResult.rows.map(usuarioFromRow);

        return {
            dados,
            meta: {
                pagina,
                por_pagina: porPagina,
                total,
                total_paginas: Math.max(1, Math.ceil(total / porPagina)),
            },
        };
    },

    /**
     * Recupera um usuário por sua chave primária (id).
     */
    async buscarPorId(id: string): Promise<Usuario | null> {
        const result = await banco.query(
            `
                SELECT
                    u.id::text AS id,
                    u.nome,
                    u.email,
                    u.email AS login,
                    COALESCE(uc.classificacao, 'HR_ADMIN')::text AS classificacao,
                    u.ativo,
                    u.created_at AS data_criacao,
                    u.updated_at AS data_atualizacao,
                    COALESCE(uc.telefone, u.telefone) AS telefone,
                    s.nome_setor AS setor,
                    uc.cargo,
                    uc.tipo_contrato,
                    TO_CHAR(uc.data_admissao, 'YYYY-MM-DD') AS data_admissao,
                    uc.descricao_cargo
                FROM usuario u
                LEFT JOIN LATERAL (
                    SELECT colaborador.*
                    FROM usuario_colaborador colaborador
                    WHERE colaborador.id_usuario = u.id OR LOWER(colaborador.email) = LOWER(u.email)
                    ORDER BY (colaborador.id_usuario = u.id) IS TRUE DESC, colaborador.created_at DESC
                    LIMIT 1
                ) uc ON TRUE
                LEFT JOIN setor s ON s.id = uc.id_setor
                WHERE u.id = $1
                LIMIT 1
            `,
            [id]
        );

        const row = result.rows[0];
        if (!row) return null;

        return usuarioFromRow(row);
    },

    /**
     * Recupera um usuário (COM SENHA_HASH) pelo identificador de login ou email.
     *
     * Este método é um contrato exclusivo da camada de autenticação
     * (`authService`) e NUNCA deve ser invocado por controllers de CRUD comum.
     */
    async buscarPorLogin(login: string): Promise<UsuarioComSenha | null> {
        const result = await banco.query(
            `
                SELECT
                    u.id::text AS id,
                    u.nome,
                    u.email,
                    u.email AS login,
                    u.senha_hash,
                    COALESCE(uc.classificacao, 'HR_ADMIN')::text AS classificacao,
                    u.ativo,
                    u.created_at AS data_criacao,
                    u.updated_at AS data_atualizacao
                FROM usuario u
                LEFT JOIN usuario_colaborador uc ON (uc.id_usuario = u.id OR LOWER(uc.email) = LOWER(u.email))
                WHERE LOWER(u.email) = LOWER($1)
                   OR LOWER(u.nome) = LOWER($1)
                ORDER BY u.created_at DESC
                LIMIT 1
            `,
            [login]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: (row.classificacao as Classificacao) || "HR_ADMIN",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
            senha_hash: String(row.senha_hash),
        };
    },

    /**
     * Recupera um usuário ativo por seu código de colaborador de quatro dígitos.
     */
    async buscarPorCodigoColaborador(codigo: string): Promise<Usuario | null> {
        const result = await banco.query(
            `
                SELECT
                    u.id::text AS id,
                    u.nome,
                    u.email,
                    u.email AS login,
                    COALESCE(uc.classificacao, 'HR_ADMIN')::text AS classificacao,
                    u.ativo,
                    u.created_at AS data_criacao,
                    u.updated_at AS data_atualizacao
                FROM public.usuario u
                LEFT JOIN usuario_colaborador uc
                    ON (uc.id_usuario = u.id OR LOWER(uc.email) = LOWER(u.email))
                WHERE u.codigo_colaborador = $1
                ORDER BY u.created_at DESC
                LIMIT 1
            `,
            [codigo]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: (row.classificacao as Classificacao) || "HR_ADMIN",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        };
    },

    /**
     * Recupera um usuário pelo endereço de e-mail.
     */
    async buscarPorEmail(email: string): Promise<Usuario | null> {
        const result = await banco.query(
            `
                SELECT
                    id::text AS id,
                    nome,
                    email,
                    email AS login,
                    'admin'::text AS classificacao,
                    ativo,
                    created_at AS data_criacao,
                    updated_at AS data_atualizacao
                FROM usuario
                WHERE LOWER(email) = LOWER($1)
                LIMIT 1
            `,
            [email]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: "admin",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        };
    },

    /**
     * Persiste um novo usuário na tabela `usuario`.
     */
    async criar(dto: CreateUserDTO): Promise<UsuarioCriado> {
        const idEmpresa = process.env.DEFAULT_EMPRESA_ID?.trim();

        if (!idEmpresa) {
            throw new AppError(
                "Não foi possível criar o usuário: DEFAULT_EMPRESA_ID não está configurada.",
                500
            );
        }

        const client = await banco.getClient();
        try {
            await client.query("BEGIN");
            let sectorId: string | null = null;
            if (dto.setor?.trim()) {
                const sectorResult = await client.query(
                    `SELECT id::text AS id FROM setor WHERE id_empresa = $1 AND LOWER(nome_setor) = LOWER($2) LIMIT 1`,
                    [idEmpresa, dto.setor.trim()]
                );
                if (!sectorResult.rows[0]) {
                    throw new AppError("O setor selecionado não existe para esta empresa.", 400);
                }
                sectorId = String(sectorResult.rows[0].id);
            }

            const result = await client.query(
                `
                    INSERT INTO public.usuario
                        (id_empresa, nome, email, senha_hash, ativo)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING
                        id::text AS id,
                        nome,
                        email,
                        codigo_colaborador,
                        ativo,
                        created_at AS data_criacao,
                        updated_at AS data_atualizacao
                `,
                [idEmpresa, dto.nome, dto.email, dto.senha, dto.ativo]
            );

            const row = result.rows[0];
            if (!row) {
                throw new Error("O banco não retornou o usuário criado.");
            }

            await client.query(
                `
                    INSERT INTO usuario_colaborador (
                        id_empresa, id_usuario, id_setor, nome, email, telefone,
                        classificacao, cargo, tipo_contrato, data_admissao,
                        descricao_cargo, status
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `,
                [
                    idEmpresa,
                    row.id,
                    sectorId,
                    dto.nome,
                    dto.email,
                    dto.telefone ?? null,
                    dto.classificacao,
                    dto.cargo ?? null,
                    dto.tipo_contrato ?? null,
                    dto.data_admissao ?? null,
                    dto.descricao_cargo ?? null,
                    dto.ativo ? "ATIVO" : "INATIVO",
                ]
            );

            await client.query("COMMIT");
            return {
                id: String(row.id),
                login: dto.login,
                nome: String(row.nome),
                email: String(row.email),
                codigo_colaborador: String(row.codigo_colaborador),
                classificacao: dto.classificacao,
                ativo: Boolean(row.ativo),
                data_criacao: new Date(row.data_criacao as string).toISOString(),
                data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
                telefone: dto.telefone ?? null,
                setor: dto.setor ?? null,
                cargo: dto.cargo ?? null,
                tipo_contrato: dto.tipo_contrato ?? null,
                data_admissao: dto.data_admissao ?? null,
                descricao_cargo: dto.descricao_cargo ?? null,
            };
        } catch (error: unknown) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError: unknown) {
                throw new AggregateError(
                    [error, rollbackError],
                    "Falha ao reverter o cadastro do colaborador no banco de dados."
                );
            }
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "23505"
            ) {
                throw new AppError("Email ou login já cadastrado no sistema.", 409);
            }

            throw error;
        } finally {
            client.release();
        }
    },

    /**
     * Atualiza campos de um usuário existente (exceto `senha` e `login`).
     */
    async atualizar(id: string, dto: UpdateUserDTO): Promise<Usuario> {
        const client = await banco.getClient();

        try {
            await client.query("BEGIN");
            const userResult = await client.query(
                `SELECT id, id_empresa, nome, email, telefone, ativo FROM usuario WHERE id = $1 FOR UPDATE`,
                [id]
            );
            const user = userResult.rows[0];
            if (!user) {
                throw new AppError("Usuário não encontrado.", 404);
            }

            const profileResult = await client.query(
                `
                    SELECT id, id_setor, classificacao, cargo, tipo_contrato,
                           data_admissao, descricao_cargo, telefone, status
                    FROM usuario_colaborador
                    WHERE id_usuario = $1 OR LOWER(email) = LOWER($2)
                    ORDER BY (id_usuario = $1) IS TRUE DESC, created_at DESC
                    LIMIT 1
                    FOR UPDATE
                `,
                [id, user.email]
            );
            const profile = profileResult.rows[0];

            const userFields: Array<[keyof UpdateUserDTO, string]> = [
                ["nome", "nome"],
                ["email", "email"],
                ["telefone", "telefone"],
                ["ativo", "ativo"],
            ];
            const assignments: string[] = [];
            const values: unknown[] = [];
            for (const [dtoField, column] of userFields) {
                if (dtoField in dto) {
                    values.push(dto[dtoField]);
                    assignments.push(`${column} = $${values.length}`);
                }
            }
            assignments.push("updated_at = NOW()");
            values.push(id);
            await client.query(
                `UPDATE usuario SET ${assignments.join(", ")} WHERE id = $${values.length}`,
                values
            );

            const profileFields = [
                "classificacao",
                "setor",
                "cargo",
                "tipo_contrato",
                "data_admissao",
                "descricao_cargo",
            ] as const;
            const shouldUpdateProfile =
                profileFields.some((field) => field in dto) ||
                "nome" in dto ||
                "email" in dto ||
                "telefone" in dto ||
                "ativo" in dto;

            if (shouldUpdateProfile) {
                let sectorId = profile?.id_setor ? String(profile.id_setor) : null;
                if ("setor" in dto) {
                    const sectorName = dto.setor?.trim();
                    if (!sectorName) {
                        sectorId = null;
                    } else {
                        const existingSector = await client.query(
                            `SELECT id FROM setor WHERE id_empresa = $1 AND LOWER(nome_setor) = LOWER($2) LIMIT 1`,
                            [user.id_empresa, sectorName]
                        );
                        if (existingSector.rows[0]) {
                            sectorId = String(existingSector.rows[0].id);
                        } else {
                            throw new AppError("O setor selecionado não existe para esta empresa.", 400);
                        }
                    }
                }

                const profileValues = [
                    user.id_empresa,
                    id,
                    sectorId,
                    dto.nome ?? String(user.nome),
                    dto.email ?? String(user.email),
                    "telefone" in dto
                        ? dto.telefone
                        : profile?.telefone ?? user.telefone ?? null,
                    dto.classificacao ?? profile?.classificacao ?? "HR_ADMIN",
                    "cargo" in dto ? dto.cargo : profile?.cargo ?? null,
                    "tipo_contrato" in dto ? dto.tipo_contrato : profile?.tipo_contrato ?? null,
                    "data_admissao" in dto ? dto.data_admissao : profile?.data_admissao ?? null,
                    "descricao_cargo" in dto
                        ? dto.descricao_cargo
                        : profile?.descricao_cargo ?? null,
                    "ativo" in dto
                        ? (dto.ativo ? "ATIVO" : "INATIVO")
                        : profile?.status ?? (user.ativo ? "ATIVO" : "INATIVO"),
                ];

                if (profile) {
                    await client.query(
                        `
                            UPDATE usuario_colaborador
                            SET id_usuario = $1, id_setor = $2, nome = $3, email = $4,
                                telefone = $5, classificacao = $6, cargo = $7,
                                tipo_contrato = $8, data_admissao = $9,
                                descricao_cargo = $10, status = $11, updated_at = NOW()
                            WHERE id = $12
                        `,
                        [...profileValues.slice(1), profile.id]
                    );
                } else {
                    await client.query(
                        `
                            INSERT INTO usuario_colaborador (
                                id_empresa, id_usuario, id_setor, nome, email, telefone,
                                classificacao, cargo, tipo_contrato, data_admissao,
                                descricao_cargo, status
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        `,
                        profileValues
                    );
                }
            }

            await client.query("COMMIT");
        } catch (error: unknown) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError: unknown) {
                throw new AggregateError(
                    [error, rollbackError],
                    "Falha ao reverter a atualização do colaborador no banco de dados."
                );
            }
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === "23505"
            ) {
                throw new AppError("Email já cadastrado por outro usuário.", 409);
            }
            throw error;
        } finally {
            client.release();
        }

        const usuario = await this.buscarPorId(id);
        if (!usuario) {
            throw new AppError("Usuário não encontrado após a atualização.", 404);
        }
        return usuario;
    },

    /**
     * Atualiza exclusivamente a coluna `senha_hash` de um usuário.
     */
    async atualizarSenha(id: string, senhaHash: string): Promise<void> {
        const result = await banco.query(
            `UPDATE usuario SET senha_hash = $1, updated_at = NOW() WHERE id = $2`,
            [senhaHash, id]
        );
        if (result.rowCount !== 1) {
            throw new AppError("Usuário não encontrado.", 404);
        }
    },

    /**
     * Remove um usuário da base.
     */
    async deletar(_id: string): Promise<void> {
        throw new AppError(
            "Recurso temporariamente indisponível: tabela de usuários ainda não foi criada no banco de dados.",
            503
        );
    },

    /**
     * Método de conveniência para a camada de autenticação.
     */
    async verificarCredenciais(
        login: string,
        _senha: string
    ): Promise<UsuarioComSenha | null> {
        const usuario = await this.buscarPorLogin(login);
        if (!usuario) return null;
        return usuario;
    },
};

export default usuariosRepositorio;
