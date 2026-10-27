import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { Company, CompanySector, CreateSectorDTO, UpdateCompanyDTO } from "./dto.js";

function companyId(): string {
    const id = process.env.DEFAULT_EMPRESA_ID?.trim();
    if (!id) {
        throw new AppError("DEFAULT_EMPRESA_ID não está configurada.", 500);
    }

    return id;
}

function companyFromRow(row: Record<string, unknown>): Company {
    const dateString = (value: unknown): string | null =>
        value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    const timestampString = (value: unknown): string =>
        value instanceof Date ? value.toISOString() : String(value ?? "");

    return {
        id: String(row.id),
        nome_empresa: String(row.nome_empresa),
        cnpj: String(row.cnpj),
        rua: row.rua == null ? null : String(row.rua),
        numero_end: row.numero_end == null ? null : String(row.numero_end),
        bairro: row.bairro == null ? null : String(row.bairro),
        cep: row.cep == null ? null : String(row.cep),
        cidade: row.cidade == null ? null : String(row.cidade),
        estado: row.estado == null ? null : String(row.estado),
        telefone: row.telefone == null ? null : String(row.telefone),
        email: row.email == null ? null : String(row.email),
        fundacao: dateString(row.fundacao),
        sobre_empresa: row.sobre_empresa == null ? null : String(row.sobre_empresa),
        nome_pagina_carreiras: row.nome_pagina_carreiras == null ? null : String(row.nome_pagina_carreiras),
        homepage_carreiras: row.homepage_carreiras == null ? null : String(row.homepage_carreiras),
        chamada_carreiras: row.chamada_carreiras == null ? null : String(row.chamada_carreiras),
        descricao_carreiras: row.descricao_carreiras == null ? null : String(row.descricao_carreiras),
        missao: row.missao == null ? null : String(row.missao),
        visao: row.visao == null ? null : String(row.visao),
        valores: row.valores == null ? null : String(row.valores),
        created_at: timestampString(row.created_at),
        updated_at: timestampString(row.updated_at),
        total_colaboradores: 0,
        setores: [],
        classificacoes: [],
    };
}

export const companyRepository = {
    async buscar(): Promise<Company> {
        const result = await banco.query(
            `SELECT id, nome_empresa, cnpj, rua, numero_end, bairro, cep, cidade,
                    estado, telefone, email, fundacao, sobre_empresa,
                    nome_pagina_carreiras, homepage_carreiras, chamada_carreiras,
                    descricao_carreiras, missao, visao, valores, created_at, updated_at
             FROM empresa
             WHERE id = $1`,
            [companyId()]
        );

        if (!result.rows[0]) {
            throw new AppError("Empresa não encontrada.", 404);
        }

        const id = companyId();
        const [sectorsResult, classificationsResult, employeesResult] = await Promise.all([
            banco.query(
                `SELECT s.id, s.nome_setor, s.icone, COUNT(uc.id)::int AS quantidade
                 FROM setor s
                 LEFT JOIN usuario_colaborador uc
                   ON uc.id_setor = s.id AND uc.id_empresa = s.id_empresa
                 WHERE s.id_empresa = $1
                 GROUP BY s.id, s.nome_setor, s.icone
                 ORDER BY s.nome_setor`,
                [id]
            ),
            banco.query(
                `SELECT DISTINCT classificacao
                 FROM usuario_colaborador
                 WHERE id_empresa = $1 AND classificacao IS NOT NULL AND BTRIM(classificacao) <> ''
                 ORDER BY classificacao`,
                [id]
            ),
            banco.query(
                `SELECT COUNT(*)::int AS quantidade
                 FROM usuario_colaborador
                 WHERE id_empresa = $1`,
                [id]
            ),
        ]);
        const company = companyFromRow(result.rows[0]);
        const sectors: CompanySector[] = sectorsResult.rows.map((row) => ({
            id: String(row.id),
            nome_setor: String(row.nome_setor),
            icone: row.icone == null ? null : String(row.icone),
            quantidade: Number(row.quantidade),
        }));

        return {
            ...company,
            setores: sectors,
            classificacoes: classificationsResult.rows.map((row) => String(row.classificacao)),
            total_colaboradores: Number(employeesResult.rows[0]?.quantidade ?? 0),
        };
    },

    async atualizar(data: UpdateCompanyDTO): Promise<Company> {
        const result = await banco.query(
            `UPDATE empresa
             SET nome_empresa = $2, cnpj = $3, rua = $4, numero_end = $5,
                 bairro = $6, cep = $7, cidade = $8, estado = $9,
                 telefone = $10, email = $11, fundacao = $12,
                 sobre_empresa = $13, nome_pagina_carreiras = $14,
                 homepage_carreiras = $15, chamada_carreiras = $16,
                 descricao_carreiras = $17, missao = $18, visao = $19, valores = $20
             WHERE id = $1
             RETURNING id, nome_empresa, cnpj, rua, numero_end, bairro, cep,
                       cidade, estado, telefone, email, fundacao, sobre_empresa,
                       nome_pagina_carreiras, homepage_carreiras, chamada_carreiras,
                       descricao_carreiras, missao, visao, valores, created_at, updated_at`,
            [
                companyId(),
                data.nome_empresa,
                data.cnpj,
                data.rua || null,
                data.numero_end || null,
                data.bairro || null,
                data.cep || null,
                data.cidade || null,
                data.estado || null,
                data.telefone || null,
                data.email || null,
                data.fundacao || null,
                data.sobre_empresa || null,
                data.nome_pagina_carreiras || null,
                data.homepage_carreiras || null,
                data.chamada_carreiras || null,
                data.descricao_carreiras || null,
                data.missao || null,
                data.visao || null,
                data.valores || null,
            ]
        );

        if (!result.rows[0]) {
            throw new AppError("Empresa não encontrada.", 404);
        }

        return this.buscar();
    },

    async criarSetor(data: CreateSectorDTO): Promise<CompanySector> {
        const idEmpresa = companyId();
        const result = await banco.query(
            `INSERT INTO setor (id_empresa, nome_setor, icone)
             VALUES ($1, $2, $3)
             ON CONFLICT (id_empresa, nome_setor) DO NOTHING
             RETURNING id, nome_setor, icone`,
            [idEmpresa, data.nome_setor, data.icone || null]
        );

        if (!result.rows[0]) {
            throw new AppError("Este setor já está cadastrado.", 409);
        }

        return {
            id: String(result.rows[0].id),
            nome_setor: String(result.rows[0].nome_setor),
            icone: result.rows[0].icone == null ? null : String(result.rows[0].icone),
            quantidade: 0,
        };
    },

    async removerSetor(id: string): Promise<void> {
        const result = await banco.query(
            `DELETE FROM setor s
             WHERE s.id = $1 AND s.id_empresa = $2
               AND NOT EXISTS (
                   SELECT 1 FROM usuario_colaborador uc
                   WHERE uc.id_setor = s.id AND uc.id_empresa = s.id_empresa
               )
             RETURNING s.id`,
            [id, companyId()]
        );

        if (result.rowCount) return;

        const sectorResult = await banco.query(
            `SELECT EXISTS (SELECT 1 FROM setor WHERE id = $1 AND id_empresa = $2) AS exists`,
            [id, companyId()]
        );
        if (!sectorResult.rows[0]?.exists) {
            throw new AppError("Setor não encontrado.", 404);
        }
        throw new AppError("Não é possível remover um setor que possui colaboradores vinculados.", 409);
    },
};
