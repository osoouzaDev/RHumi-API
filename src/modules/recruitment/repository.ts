import type { PoolClient } from "pg";
import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
    ApplicationStatus,
    CreateCandidateApplicationDTO,
    CreateVacancyDTO,
    VacancyStatus,
} from "./dto.js";

export interface VacancyRecord {
    id: string;
    titulo: string;
    setor: string;
    localidade: string | null;
    tipo_contrato: string;
    descricao: string | null;
    status: VacancyStatus;
    created_at: string;
}

export interface CandidateApplicationRecord {
    id: string;
    id_candidato: string;
    nome: string;
    email: string;
    telefone: string | null;
    id_vaga: string;
    vaga_titulo: string;
    status: ApplicationStatus;
    created_at: string;
}

async function resolveCompanyId(userId: string): Promise<string> {
    const result = await banco.query(
        `SELECT id_empresa::text AS id_empresa
         FROM usuario
         WHERE id = $1 AND ativo = TRUE`,
        [userId]
    );
    const companyId = result.rows[0]?.id_empresa;
    if (!companyId) {
        throw new AppError("Empresa do usuário autenticado não encontrada.", 404);
    }
    return String(companyId);
}

function vacancyFromRow(row: Record<string, unknown>): VacancyRecord {
    return {
        id: String(row.id),
        titulo: String(row.titulo),
        setor: String(row.setor),
        localidade: row.localidade == null ? null : String(row.localidade),
        tipo_contrato: String(row.tipo_contrato),
        descricao: row.descricao == null ? null : String(row.descricao),
        status: String(row.status) as VacancyStatus,
        created_at: new Date(row.created_at as string).toISOString(),
    };
}

function applicationFromRow(row: Record<string, unknown>): CandidateApplicationRecord {
    return {
        id: String(row.id),
        id_candidato: String(row.id_candidato),
        nome: String(row.nome),
        email: String(row.email),
        telefone: row.telefone == null ? null : String(row.telefone),
        id_vaga: String(row.id_vaga),
        vaga_titulo: String(row.vaga_titulo),
        status: String(row.status) as ApplicationStatus,
        created_at: new Date(row.created_at as string).toISOString(),
    };
}

async function findApplication(client: PoolClient, companyId: string, applicationId: string): Promise<CandidateApplicationRecord> {
    const result = await client.query(
        `SELECT ca.id::text AS id, ca.id_candidato::text AS id_candidato,
                c.nome, c.email, c.telefone, ca.id_vaga::text AS id_vaga,
                v.titulo AS vaga_titulo, ca.status, ca.created_at
         FROM candidatura ca
         JOIN candidato c ON c.id = ca.id_candidato AND c.id_empresa = ca.id_empresa
         JOIN vaga v ON v.id = ca.id_vaga AND v.id_empresa = ca.id_empresa
         WHERE ca.id_empresa = $1 AND ca.id = $2`,
        [companyId, applicationId]
    );
    if (!result.rows[0]) {
        throw new AppError("Candidatura não encontrada.", 404);
    }
    return applicationFromRow(result.rows[0]);
}

export const recruitmentRepository = {
    async listVacancies(userId: string): Promise<VacancyRecord[]> {
        const companyId = await resolveCompanyId(userId);
        const result = await banco.query(
            `SELECT id::text AS id, titulo, setor, localidade, tipo_contrato,
                    descricao, status, created_at
             FROM vaga
             WHERE id_empresa = $1
             ORDER BY created_at DESC, titulo`,
            [companyId]
        );
        return result.rows.map(vacancyFromRow);
    },

    async createVacancy(userId: string, data: CreateVacancyDTO): Promise<VacancyRecord> {
        const companyId = await resolveCompanyId(userId);
        const result = await banco.query(
            `INSERT INTO vaga (id_empresa, titulo, setor, localidade, tipo_contrato, descricao)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id::text AS id, titulo, setor, localidade, tipo_contrato,
                       descricao, status, created_at`,
            [
                companyId,
                data.titulo,
                data.setor,
                data.localidade || null,
                data.tipo_contrato,
                data.descricao || null,
            ]
        );
        if (!result.rows[0]) {
            throw new AppError("Não foi possível salvar a vaga.", 500);
        }
        return vacancyFromRow(result.rows[0]);
    },

    async updateVacancyStatus(userId: string, vacancyId: string, status: VacancyStatus): Promise<VacancyRecord> {
        const companyId = await resolveCompanyId(userId);
        const result = await banco.query(
            `UPDATE vaga
             SET status = $3, updated_at = NOW()
             WHERE id = $1 AND id_empresa = $2
             RETURNING id::text AS id, titulo, setor, localidade, tipo_contrato,
                       descricao, status, created_at`,
            [vacancyId, companyId, status]
        );
        if (!result.rows[0]) {
            throw new AppError("Vaga não encontrada.", 404);
        }
        return vacancyFromRow(result.rows[0]);
    },

    async listApplications(userId: string): Promise<CandidateApplicationRecord[]> {
        const companyId = await resolveCompanyId(userId);
        const result = await banco.query(
            `SELECT ca.id::text AS id, ca.id_candidato::text AS id_candidato,
                    c.nome, c.email, c.telefone, ca.id_vaga::text AS id_vaga,
                    v.titulo AS vaga_titulo, ca.status, ca.created_at
             FROM candidatura ca
             JOIN candidato c ON c.id = ca.id_candidato AND c.id_empresa = ca.id_empresa
             JOIN vaga v ON v.id = ca.id_vaga AND v.id_empresa = ca.id_empresa
             WHERE ca.id_empresa = $1
             ORDER BY ca.created_at DESC, c.nome`,
            [companyId]
        );
        return result.rows.map(applicationFromRow);
    },

    async createApplication(userId: string, data: CreateCandidateApplicationDTO): Promise<CandidateApplicationRecord> {
        const companyId = await resolveCompanyId(userId);
        const client = await banco.getClient();
        try {
            await client.query("BEGIN");
            const vacancyResult = await client.query(
                `SELECT id
                 FROM vaga
                 WHERE id = $1 AND id_empresa = $2 AND status = 'ABERTA'
                 FOR SHARE`,
                [data.id_vaga, companyId]
            );
            if (!vacancyResult.rows[0]) {
                throw new AppError("A vaga selecionada não existe ou não está aberta.", 404);
            }

            const candidateResult = await client.query(
                `INSERT INTO candidato (id_empresa, nome, email, telefone)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (id_empresa, email)
                 DO UPDATE SET nome = EXCLUDED.nome,
                               telefone = COALESCE(EXCLUDED.telefone, candidato.telefone),
                               updated_at = NOW()
                 RETURNING id::text AS id`,
                [companyId, data.nome, data.email, data.telefone || null]
            );
            const candidateRecord = candidateResult.rows[0];
            if (!candidateRecord?.id) {
                throw new AppError("Não foi possível salvar os dados do candidato.", 500);
            }
            const candidateId = String(candidateRecord.id);
            const applicationResult = await client.query(
                `INSERT INTO candidatura (id_empresa, id_vaga, id_candidato)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id_vaga, id_candidato) DO NOTHING
                 RETURNING id::text AS id`,
                [companyId, data.id_vaga, candidateId]
            );

            let applicationId = applicationResult.rows[0]?.id
                ? String(applicationResult.rows[0].id)
                : "";
            if (!applicationId) {
                const existingApplication = await client.query(
                    `SELECT id::text AS id FROM candidatura
                     WHERE id_empresa = $1 AND id_vaga = $2 AND id_candidato = $3`,
                    [companyId, data.id_vaga, candidateId]
                );
                const existingApplicationId = existingApplication.rows[0]?.id;
                if (!existingApplicationId) {
                    throw new AppError("Não foi possível salvar a candidatura.", 500);
                }
                applicationId = String(existingApplicationId);
            }

            const application = await findApplication(client, companyId, applicationId);
            await client.query("COMMIT");
            return application;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    },

    async updateApplicationStatus(
        userId: string,
        applicationId: string,
        status: ApplicationStatus
    ): Promise<CandidateApplicationRecord> {
        const companyId = await resolveCompanyId(userId);
        const client = await banco.getClient();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE candidatura
                 SET status = $3, updated_at = NOW()
                 WHERE id = $1 AND id_empresa = $2
                 RETURNING id::text AS id`,
                [applicationId, companyId, status]
            );
            if (!result.rows[0]) {
                throw new AppError("Candidatura não encontrada.", 404);
            }
            const application = await findApplication(client, companyId, applicationId);
            await client.query("COMMIT");
            return application;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    },
};
