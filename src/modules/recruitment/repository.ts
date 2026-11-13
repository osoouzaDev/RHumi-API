import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
    CandidateApplicationDTO,
    CreateVacancyDTO,
    UpdateApplicationStatusDTO,
    UpdateVacancyStatusDTO,
} from "./dto.js";

function companyId(): string {
    const id = process.env.DEFAULT_EMPRESA_ID?.trim();
    if (!id) {
        throw new AppError("DEFAULT_EMPRESA_ID não está configurada.", 500);
    }
    return id;
}

function timestamp(value: unknown): string {
    return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function vacancyFromRow(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        titulo: String(row.titulo),
        setor: String(row.setor),
        localidade: row.localidade == null ? null : String(row.localidade),
        tipo_contrato: String(row.tipo_contrato),
        descricao: row.descricao == null ? null : String(row.descricao),
        status: String(row.status),
        created_at: timestamp(row.created_at),
    };
}

function applicationFromRow(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        id_candidato: String(row.id),
        nome: String(row.nome),
        email: String(row.email),
        telefone: row.telefone == null ? null : String(row.telefone),
        id_vaga: String(row.id_vaga),
        vaga_titulo: String(row.vaga_titulo),
        status: String(row.status),
        created_at: timestamp(row.created_at),
    };
}

const vacancyColumns = `id::text AS id, titulo, setor, localidade, tipo_contrato,
                        descricao, status, created_at`;

export const recruitmentRepository = {
    async listarVagas() {
        const result = await banco.query(
            `SELECT ${vacancyColumns}
             FROM vaga
             WHERE id_empresa = $1
             ORDER BY created_at DESC`,
            [companyId()],
        );
        return result.rows.map(vacancyFromRow);
    },

    async criarVaga(data: CreateVacancyDTO) {
        const result = await banco.query(
            `INSERT INTO vaga
                 (id_empresa, titulo, setor, localidade, tipo_contrato, descricao)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING ${vacancyColumns}`,
            [
                companyId(),
                data.titulo,
                data.setor,
                data.localidade || null,
                data.tipo_contrato,
                data.descricao ?? null,
            ],
        );
        const row = result.rows[0];
        if (!row) {
            throw new AppError("Não foi possível criar a vaga.", 500);
        }
        return vacancyFromRow(row);
    },

    async listarVagasPublicas() {
        const result = await banco.query(
            `SELECT ${vacancyColumns}
             FROM vaga
             WHERE id_empresa = $1 AND status = 'ABERTA'
             ORDER BY created_at DESC`,
            [companyId()],
        );
        return result.rows.map(vacancyFromRow);
    },

    async atualizarStatusVaga(id: string, data: UpdateVacancyStatusDTO) {
        const result = await banco.query(
            `UPDATE vaga
             SET status = $3, updated_at = NOW()
             WHERE id = $1 AND id_empresa = $2
             RETURNING ${vacancyColumns}`,
            [id, companyId(), data.status],
        );
        if (!result.rows[0]) {
            throw new AppError("Vaga não encontrada.", 404);
        }
        return vacancyFromRow(result.rows[0]);
    },

    async listarCandidaturas() {
        const result = await banco.query(
            `SELECT candidatura.id::text AS id,
                    COALESCE(candidatura.nome, usuario.nome) AS nome,
                    COALESCE(candidatura.email, usuario.email) AS email,
                    candidatura.telefone, candidatura.id_vaga::text AS id_vaga,
                    vaga.titulo AS vaga_titulo, candidatura.status, candidatura.created_at
             FROM candidatura
             JOIN vaga ON vaga.id = candidatura.id_vaga
                       AND vaga.id_empresa = candidatura.id_empresa
             LEFT JOIN usuario ON usuario.id = candidatura.id_usuario
                              AND usuario.id_empresa = candidatura.id_empresa
             WHERE candidatura.id_empresa = $1
             ORDER BY candidatura.created_at DESC`,
            [companyId()],
        );
        return result.rows.map(applicationFromRow);
    },

    async atualizarStatusCandidatura(id: string, data: UpdateApplicationStatusDTO) {
        const result = await banco.query(
            `UPDATE candidatura
             SET status = $3, updated_at = NOW()
             FROM vaga
             WHERE candidatura.id = $1
               AND candidatura.id_empresa = $2
               AND vaga.id = candidatura.id_vaga
               AND vaga.id_empresa = candidatura.id_empresa
             RETURNING candidatura.id::text AS id,
                       COALESCE(candidatura.nome, (
                           SELECT usuario.nome FROM usuario
                           WHERE usuario.id = candidatura.id_usuario
                       )) AS nome,
                       COALESCE(candidatura.email, (
                           SELECT usuario.email FROM usuario
                           WHERE usuario.id = candidatura.id_usuario
                       )) AS email,
                       candidatura.telefone,
                       candidatura.id_vaga::text AS id_vaga, vaga.titulo AS vaga_titulo,
                       candidatura.status, candidatura.created_at`,
            [id, companyId(), data.status],
        );
        if (!result.rows[0]) {
            throw new AppError("Candidatura não encontrada.", 404);
        }
        return applicationFromRow(result.rows[0]);
    },

    async listarCandidaturasDoCandidato(usuarioId: string) {
        const result = await banco.query(
            `SELECT candidatura.id::text AS id, candidatura.id::text AS id_candidato,
                    candidatura.nome, candidatura.email, candidatura.telefone,
                    candidatura.id_vaga::text AS id_vaga, vaga.titulo AS vaga_titulo,
                    candidatura.status, candidatura.created_at
             FROM candidatura
             JOIN vaga ON vaga.id = candidatura.id_vaga
                       AND vaga.id_empresa = candidatura.id_empresa
             WHERE candidatura.id_empresa = $1 AND candidatura.id_usuario = $2
             ORDER BY candidatura.created_at DESC`,
            [companyId(), usuarioId],
        );
        return result.rows.map(applicationFromRow);
    },

    async candidatarComoUsuario(usuarioId: string, data: CandidateApplicationDTO) {
        const idEmpresa = companyId();
        let result;
        try {
            result = await banco.query(
                `INSERT INTO candidatura
                     (id_empresa, id_vaga, id_usuario, nome, email, telefone, origem)
                 SELECT usuario.id_empresa, vaga.id, usuario.id, usuario.nome, usuario.email,
                        COALESCE(colaborador.telefone, usuario.telefone), 'Site'
                 FROM usuario
                 JOIN usuario_colaborador colaborador
                   ON colaborador.id_usuario = usuario.id
                  AND colaborador.id_empresa = usuario.id_empresa
                  AND UPPER(colaborador.classificacao) = 'CANDIDATE'
                 JOIN vaga ON vaga.id = $2
                           AND vaga.id_empresa = usuario.id_empresa
                           AND vaga.status = 'ABERTA'
                 WHERE usuario.id = $1
                   AND usuario.id_empresa = $3
                   AND usuario.ativo = TRUE
                 RETURNING id::text AS id, id::text AS id_candidato, nome, email, telefone,
                           id_vaga::text AS id_vaga, status, created_at`,
                [usuarioId, data.id_vaga, idEmpresa],
            );
        } catch (error: unknown) {
            if (
                error && typeof error === "object" &&
                "code" in error && error.code === "23505"
            ) {
                throw new AppError("Você já se candidatou a esta vaga.", 409);
            }
            throw error;
        }
        const row = result.rows[0];
        if (!row) {
            const vacancyResult = await banco.query(
                `SELECT 1 FROM vaga WHERE id = $1 AND id_empresa = $2 AND status = 'ABERTA'`,
                [data.id_vaga, idEmpresa],
            );
            if (!vacancyResult.rows[0]) {
                throw new AppError("Esta vaga não está mais disponível.", 404);
            }
            throw new AppError("Não foi possível validar a conta de candidato.", 403);
        }

        const vacancyResult = await banco.query(
            `SELECT titulo FROM vaga WHERE id = $1 AND id_empresa = $2`,
            [data.id_vaga, idEmpresa],
        );
        return applicationFromRow({ ...row, vaga_titulo: vacancyResult.rows[0]?.titulo });
    },
};
