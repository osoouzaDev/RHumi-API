import type { PoolClient } from "pg";
import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { SaveLearningItemDTO, SubmitAssessmentDTO } from "./dto.js";

const adminProfiles = new Set(["sakai", "admin", "hr_admin", "supervisor"]);
type QuestionInput = NonNullable<SaveLearningItemDTO["perguntas"]>[number];
type QueryExecutor = (
    text: string,
    params?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

function companyId(): string {
    const id = process.env.DEFAULT_EMPRESA_ID?.trim();
    if (!id) throw new AppError("DEFAULT_EMPRESA_ID não está configurada.", 500);
    return id;
}

function isAdmin(profile: string): boolean {
    return adminProfiles.has(profile.trim().toLowerCase());
}

function mapTimestamp(value: unknown): string {
    return value instanceof Date ? value.toISOString() : String(value ?? "");
}

async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await banco.getClient();
    try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function ensureSectors(
    client: PoolClient,
    sectors: string[],
    idEmpresa: string,
): Promise<void> {
    const uniqueSectors = [...new Set(sectors)];
    const result = await client.query(
        `SELECT id FROM public.setor WHERE id_empresa = $1 AND id = ANY($2::uuid[])`,
        [idEmpresa, uniqueSectors],
    );
    if (result.rowCount !== uniqueSectors.length) {
        throw new AppError("Um ou mais setores não pertencem a esta empresa.", 400);
    }
}

async function replaceSectors(
    client: PoolClient,
    contentId: string,
    sectors: string[],
): Promise<void> {
    await client.query(`DELETE FROM public.rh_conteudo_setor WHERE id_conteudo = $1`, [contentId]);
    for (const sectorId of new Set(sectors)) {
        await client.query(
            `INSERT INTO public.rh_conteudo_setor (id_conteudo, id_setor) VALUES ($1, $2)`,
            [contentId, sectorId],
        );
    }
}

async function replaceQuestions(
    client: PoolClient,
    contentId: string,
    questions: QuestionInput[],
): Promise<void> {
    await client.query(`DELETE FROM public.rh_pergunta WHERE id_conteudo = $1`, [contentId]);
    for (const [questionIndex, question] of questions.entries()) {
        const questionId = question.id ?? crypto.randomUUID();
        await client.query(
            `INSERT INTO public.rh_pergunta (id, id_conteudo, texto, ordem)
             VALUES ($1, $2, $3, $4)`,
            [questionId, contentId, question.texto, questionIndex + 1],
        );
        for (const [optionIndex, option] of question.alternativas.entries()) {
            await client.query(
                `INSERT INTO public.rh_alternativa (id, id_pergunta, texto, correta, ordem)
                 VALUES ($1, $2, $3, $4, $5)`,
                [option.id ?? crypto.randomUUID(), questionId, option.texto, option.correta, optionIndex + 1],
            );
        }
    }
}

async function itemDetails(
    contentId: string,
    idEmpresa: string,
    includeCorrectAnswers: boolean,
    query: QueryExecutor = (text, params) => banco.query(text, params),
): Promise<Record<string, unknown> | null> {
    const itemResult = await query(
        `SELECT id::text AS id, tipo, titulo, descricao, tipo_material, url_material,
                prova_ativa, prova_titulo, prova_descricao, prova_nota_minima,
                (arquivo_pdf IS NOT NULL) AS tem_pdf, ativo, created_at, updated_at
         FROM public.rh_conteudo
         WHERE id = $1 AND id_empresa = $2`,
        [contentId, idEmpresa],
    );
    const item = itemResult.rows[0];
    if (!item) return null;

    const [sectorsResult, questionsResult] = await Promise.all([
        query(
            `SELECT setor.id::text AS id, setor.nome_setor
             FROM public.rh_conteudo_setor cs
             JOIN public.setor setor ON setor.id = cs.id_setor
             WHERE cs.id_conteudo = $1 ORDER BY setor.nome_setor`,
            [contentId],
        ),
        query(
            `SELECT pergunta.id::text AS id, pergunta.texto, pergunta.ordem,
                    alternativa.id::text AS alternativa_id, alternativa.texto AS alternativa_texto,
                    alternativa.correta, alternativa.ordem AS alternativa_ordem
             FROM public.rh_pergunta pergunta
             LEFT JOIN public.rh_alternativa alternativa ON alternativa.id_pergunta = pergunta.id
             WHERE pergunta.id_conteudo = $1
             ORDER BY pergunta.ordem, alternativa.ordem`,
            [contentId],
        ),
    ]);

    const questions = new Map<string, {
        id: string;
        texto: string;
        alternativas: Array<Record<string, unknown>>;
    }>();
    for (const row of questionsResult.rows) {
        const questionId = String(row.id);
        let question = questions.get(questionId);
        if (!question) {
            question = { id: questionId, texto: String(row.texto), alternativas: [] };
            questions.set(questionId, question);
        }
        if (row.alternativa_id) {
            const alternative: Record<string, unknown> = {
                id: String(row.alternativa_id),
                texto: String(row.alternativa_texto),
            };
            if (includeCorrectAnswers) alternative["correta"] = Boolean(row.correta);
            question.alternativas.push(alternative);
        }
    }

    const mappedQuestions = [...questions.values()];
    const contentType = String(item.tipo);
    return {
        id: String(item.id),
        tipo: contentType,
        titulo: String(item.titulo),
        descricao: item.descricao == null ? null : String(item.descricao),
        tipo_material: item.tipo_material == null ? null : String(item.tipo_material),
        url_material: item.url_material == null ? null : String(item.url_material),
        tem_pdf: Boolean(item.tem_pdf),
        ativo: Boolean(item.ativo),
        setores: sectorsResult.rows.map((row) => ({
            id: String(row.id),
            nome_setor: String(row.nome_setor),
        })),
        perguntas: contentType === "AVALIACAO" ? mappedQuestions : [],
        prova: contentType === "TREINAMENTO" ? {
            ativa: Boolean(item.prova_ativa),
            titulo: item.prova_titulo == null ? "" : String(item.prova_titulo),
            descricao: item.prova_descricao == null ? "" : String(item.prova_descricao),
            nota_minima: Number(item.prova_nota_minima ?? 70),
            perguntas: mappedQuestions,
        } : null,
        created_at: mapTimestamp(item.created_at),
        updated_at: mapTimestamp(item.updated_at),
    };
}

export const learningRepository = {
    async listar(usuarioId: string, perfil: string) {
        const idEmpresa = companyId();
        const admin = isAdmin(perfil);
        if (!admin && perfil.trim().toUpperCase() !== "EMPLOYEE") {
            throw new AppError("Acesso permitido somente a administradores e colaboradores.", 403);
        }

        const itemsResult = admin
            ? await banco.query(
                `SELECT conteudo.id::text AS id,
                        EXISTS (
                            SELECT 1 FROM public.rh_avaliacao_tentativa tentativa
                            WHERE tentativa.id_conteudo = conteudo.id
                        ) AS tem_resultados
                 FROM public.rh_conteudo conteudo
                 WHERE id_empresa = $1 ORDER BY created_at DESC`,
                [idEmpresa],
            )
            : await banco.query(
                `SELECT DISTINCT conteudo.id::text AS id
                 FROM public.rh_conteudo conteudo
                 JOIN public.rh_conteudo_setor cs ON cs.id_conteudo = conteudo.id
                 JOIN public.usuario u ON u.id = $2 AND u.id_empresa = conteudo.id_empresa
                                      AND u.ativo = TRUE
                 JOIN public.usuario_colaborador colaborador
                   ON colaborador.id_empresa = conteudo.id_empresa
                  AND (colaborador.id_usuario = u.id OR LOWER(colaborador.email) = LOWER(u.email))
                  AND colaborador.status = 'ATIVO'
                  AND UPPER(colaborador.classificacao) = 'EMPLOYEE'
                 WHERE conteudo.id_empresa = $1 AND conteudo.ativo = TRUE
                   AND cs.id_setor = colaborador.id_setor
                 ORDER BY id`,
                [idEmpresa, usuarioId],
            );

        const items = await Promise.all(itemsResult.rows.map(async (row) => {
            const item = await itemDetails(String(row.id), idEmpresa, admin);
            if (!item) return null;
            if (admin) item["tem_resultados"] = Boolean(row.tem_resultados);
            if (!admin) {
                const attempt = await banco.query(
                    `SELECT acertos, total_perguntas, entregue_em,
                            nota_minima_snapshot, aprovado
                     FROM public.rh_avaliacao_tentativa
                     WHERE id_conteudo = $1 AND id_usuario = $2`,
                    [String(row.id), usuarioId],
                );
                const result = attempt.rows[0];
                const attemptResult = result ? {
                    acertos: Number(result.acertos),
                    total_perguntas: Number(result.total_perguntas),
                    entregue_em: mapTimestamp(result.entregue_em),
                    percentual: Math.round(Number(result.acertos) * 100 / Number(result.total_perguntas)),
                    nota_minima: result.nota_minima_snapshot == null ? null : Number(result.nota_minima_snapshot),
                    aprovado: result.aprovado == null ? null : Boolean(result.aprovado),
                } : null;
                if (String(item["tipo"]) === "TREINAMENTO") {
                    const proof = item["prova"] as Record<string, unknown> | null;
                    if (proof) {
                        proof["tentada"] = Boolean(result);
                        proof["resultado"] = attemptResult;
                    }
                } else {
                    item["tentada"] = Boolean(result);
                    item["resultado"] = attemptResult;
                }
            }
            return item;
        }));
        return items.filter((item): item is Record<string, unknown> => item !== null);
    },

    async criar(data: SaveLearningItemDTO, arquivoPdf: string | null) {
        const idEmpresa = companyId();
        if (data.tipo === "TREINAMENTO" && data.tipo_material === "PDF" &&
            !data.url_material && !arquivoPdf) {
            throw new AppError("Informe a URL do PDF ou anexe um arquivo PDF.", 400);
        }

        const saved = await transaction(async (client) => {
            await ensureSectors(client, data.setores, idEmpresa);
            const result = await client.query(
                `INSERT INTO public.rh_conteudo
                     (id_empresa, tipo, titulo, descricao, tipo_material, url_material, arquivo_pdf, ativo,
                      prova_ativa, prova_titulo, prova_descricao, prova_nota_minima)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING id::text AS id`,
                [
                    idEmpresa, data.tipo, data.titulo, data.descricao,
                    data.tipo === "TREINAMENTO" ? data.tipo_material : null,
                    data.tipo === "TREINAMENTO" ? data.url_material : null,
                    arquivoPdf,
                    data.ativo,
                    data.tipo === "TREINAMENTO" && data.prova?.ativa === true,
                    data.tipo === "TREINAMENTO" ? data.prova?.titulo || null : null,
                    data.tipo === "TREINAMENTO" ? data.prova?.descricao || null : null,
                    data.tipo === "TREINAMENTO" ? data.prova?.nota_minima ?? 70 : 70,
                ],
            );
            const id = String(result.rows[0]?.id ?? "");
            if (!id) throw new AppError("Não foi possível criar o conteúdo.", 500);
            await replaceSectors(client, id, data.setores);
            if (data.tipo === "AVALIACAO") {
                await replaceQuestions(client, id, data.perguntas ?? []);
            } else if (data.prova?.ativa) {
                await replaceQuestions(client, id, data.prova.perguntas);
            }
            return itemDetails(
                id,
                idEmpresa,
                true,
                (text, params) => client.query(text, params),
            );
        });
        if (!saved) throw new AppError("O conteúdo criado não foi localizado.", 500);
        return saved;
    },

    async buscarArquivoPdf(id: string): Promise<string | null> {
        const result = await banco.query(
            `SELECT arquivo_pdf FROM public.rh_conteudo WHERE id = $1 AND id_empresa = $2`,
            [id, companyId()],
        );
        return result.rows[0]?.arquivo_pdf == null ? null : String(result.rows[0].arquivo_pdf);
    },

    async atualizar(id: string, data: SaveLearningItemDTO, arquivoPdf: string | null) {
        const idEmpresa = companyId();
        if (data.tipo === "TREINAMENTO" && data.tipo_material === "PDF" &&
            !data.url_material && !arquivoPdf && !(await this.buscarArquivoPdf(id))) {
            throw new AppError("Informe a URL do PDF ou anexe um arquivo PDF.", 400);
        }
        const saved = await transaction(async (client) => {
            await ensureSectors(client, data.setores, idEmpresa);
            const current = await client.query(
                `SELECT arquivo_pdf, tipo FROM public.rh_conteudo
                 WHERE id = $1 AND id_empresa = $2 FOR UPDATE`,
                [id, idEmpresa],
            );
            if (!current.rows[0]) throw new AppError("Conteúdo não encontrado.", 404);
            if (String(current.rows[0].tipo) !== data.tipo) {
                throw new AppError("O tipo de conteúdo não pode ser alterado após a criação.", 409);
            }
            const existingPdf = current.rows[0].arquivo_pdf == null
                ? null
                : String(current.rows[0].arquivo_pdf);
            const nextPdf = data.tipo !== "TREINAMENTO" || data.tipo_material !== "PDF" || data.url_material
                ? null
                : arquivoPdf ?? existingPdf;
            await client.query(
                `UPDATE public.rh_conteudo
                 SET tipo = $3, titulo = $4, descricao = $5, tipo_material = $6,
                     url_material = $7, arquivo_pdf = $8, ativo = $9,
                     prova_ativa = $10, prova_titulo = $11, prova_descricao = $12,
                     prova_nota_minima = $13
                 WHERE id = $1 AND id_empresa = $2`,
                [
                    id, idEmpresa, data.tipo, data.titulo, data.descricao,
                    data.tipo === "TREINAMENTO" ? data.tipo_material : null,
                    data.tipo === "TREINAMENTO" ? data.url_material : null,
                    nextPdf, data.ativo,
                    data.tipo === "TREINAMENTO" && data.prova?.ativa === true,
                    data.tipo === "TREINAMENTO" ? data.prova?.titulo || null : null,
                    data.tipo === "TREINAMENTO" ? data.prova?.descricao || null : null,
                    data.tipo === "TREINAMENTO" ? data.prova?.nota_minima ?? 70 : 70,
                ],
            );
            await replaceSectors(client, id, data.setores);
            if (data.tipo === "AVALIACAO") {
                await replaceQuestions(client, id, data.perguntas ?? []);
            } else if (data.prova?.ativa) {
                await replaceQuestions(client, id, data.prova.perguntas);
            }
            return itemDetails(
                id,
                idEmpresa,
                true,
                (text, params) => client.query(text, params),
            );
        });
        if (!saved) throw new AppError("O conteúdo atualizado não foi localizado.", 500);
        return saved;
    },

    async atualizarStatus(id: string, ativo: boolean) {
        const result = await banco.query(
            `UPDATE public.rh_conteudo SET ativo = $3
             WHERE id = $1 AND id_empresa = $2 RETURNING id::text AS id`,
            [id, companyId(), ativo],
        );
        if (!result.rows[0]) throw new AppError("Conteúdo não encontrado.", 404);
        return { atualizado: true, ativo };
    },

    async excluir(
        id: string,
        apagarResultados: boolean,
    ): Promise<{ arquivo_pdf: string | null }> {
        const idEmpresa = companyId();
        return transaction(async (client) => {
            const content = await client.query(
                `SELECT arquivo_pdf FROM public.rh_conteudo
                 WHERE id = $1 AND id_empresa = $2 FOR UPDATE`,
                [id, idEmpresa],
            );
            if (!content.rows[0]) throw new AppError("Conteúdo não encontrado.", 404);

            const attempts = await client.query(
                `SELECT EXISTS (
                     SELECT 1 FROM public.rh_avaliacao_tentativa
                     WHERE id_conteudo = $1
                 ) AS possui_resultados`,
                [id],
            );
            if (Boolean(attempts.rows[0]?.possui_resultados) && !apagarResultados) {
                throw new AppError(
                    "Este conteúdo possui resultados. Confirme a exclusão também dos resultados.",
                    409,
                );
            }

            await client.query(
                `DELETE FROM public.rh_conteudo
                 WHERE id = $1 AND id_empresa = $2`,
                [id, idEmpresa],
            );
            return {
                arquivo_pdf: content.rows[0].arquivo_pdf == null
                    ? null
                    : String(content.rows[0].arquivo_pdf),
            };
        });
    },

    async listarResultados(id: string) {
        const content = await banco.query(
            `SELECT id FROM public.rh_conteudo
             WHERE id = $1 AND id_empresa = $2
               AND (
                   tipo = 'AVALIACAO'
                   OR (tipo = 'TREINAMENTO' AND (
                       prova_ativa OR EXISTS (
                           SELECT 1 FROM public.rh_avaliacao_tentativa tentativa
                           WHERE tentativa.id_conteudo = rh_conteudo.id
                       )
                   ))
               )`,
            [id, companyId()],
        );
        if (!content.rows[0]) throw new AppError("Avaliação não encontrada.", 404);
        const result = await banco.query(
            `SELECT tentativa.id::text AS id, usuario.id::text AS id_usuario,
                    usuario.nome, usuario.email, tentativa.acertos,
                    tentativa.total_perguntas, tentativa.entregue_em,
                    tentativa.nota_minima_snapshot, tentativa.aprovado
             FROM public.rh_avaliacao_tentativa tentativa
             JOIN public.usuario usuario ON usuario.id = tentativa.id_usuario
             WHERE tentativa.id_conteudo = $1
             ORDER BY tentativa.entregue_em DESC`,
            [id],
        );
        return result.rows.map((row) => ({
            id: String(row.id),
            id_usuario: String(row.id_usuario),
            nome: String(row.nome),
            email: String(row.email),
            acertos: Number(row.acertos),
            total_perguntas: Number(row.total_perguntas),
            entregue_em: mapTimestamp(row.entregue_em),
            percentual: Math.round(Number(row.acertos) * 100 / Number(row.total_perguntas)),
            nota_minima: row.nota_minima_snapshot == null ? null : Number(row.nota_minima_snapshot),
            aprovado: row.aprovado == null ? null : Boolean(row.aprovado),
        }));
    },

    async caminhoPdf(id: string, usuarioId: string, perfil: string): Promise<string> {
        const admin = isAdmin(perfil);
        const result = admin
            ? await banco.query(
                `SELECT arquivo_pdf FROM public.rh_conteudo
                 WHERE id = $1 AND id_empresa = $2 AND tipo = 'TREINAMENTO'
                   AND tipo_material = 'PDF'`,
                [id, companyId()],
            )
            : await banco.query(
                `SELECT conteudo.arquivo_pdf
                 FROM public.rh_conteudo conteudo
                 JOIN public.rh_conteudo_setor cs ON cs.id_conteudo = conteudo.id
                 JOIN public.usuario u ON u.id = $2 AND u.id_empresa = conteudo.id_empresa
                                      AND u.ativo = TRUE
                 JOIN public.usuario_colaborador colaborador
                   ON colaborador.id_empresa = conteudo.id_empresa
                  AND (colaborador.id_usuario = u.id OR LOWER(colaborador.email) = LOWER(u.email))
                  AND colaborador.status = 'ATIVO' AND UPPER(colaborador.classificacao) = 'EMPLOYEE'
                  AND colaborador.id_setor = cs.id_setor
                 WHERE conteudo.id = $1 AND conteudo.id_empresa = $3
                   AND conteudo.ativo = TRUE AND conteudo.tipo = 'TREINAMENTO'
                   AND conteudo.tipo_material = 'PDF'
                 LIMIT 1`,
                [id, usuarioId, companyId()],
            );
        const storedPath = result.rows[0]?.arquivo_pdf;
        if (storedPath == null) throw new AppError("Arquivo PDF não encontrado.", 404);
        return String(storedPath);
    },

    async enviarAvaliacao(
        id: string,
        usuarioId: string,
        respostas: SubmitAssessmentDTO["respostas"],
    ) {
        try {
            return await transaction(async (client) => {
                const assessment = await client.query(
                    `SELECT conteudo.id, conteudo.tipo, conteudo.prova_ativa,
                            conteudo.prova_nota_minima
                     FROM public.rh_conteudo conteudo
                     JOIN public.rh_conteudo_setor cs ON cs.id_conteudo = conteudo.id
                     JOIN public.usuario u ON u.id = $2 AND u.id_empresa = conteudo.id_empresa
                                          AND u.ativo = TRUE
                     JOIN public.usuario_colaborador colaborador
                       ON colaborador.id_empresa = conteudo.id_empresa
                      AND (colaborador.id_usuario = u.id OR LOWER(colaborador.email) = LOWER(u.email))
                      AND colaborador.status = 'ATIVO'
                      AND UPPER(colaborador.classificacao) = 'EMPLOYEE'
                      AND colaborador.id_setor = cs.id_setor
                     WHERE conteudo.id = $1 AND conteudo.id_empresa = $3
                       AND conteudo.ativo = TRUE
                       AND (conteudo.tipo = 'AVALIACAO'
                            OR (conteudo.tipo = 'TREINAMENTO' AND conteudo.prova_ativa = TRUE))
                     FOR UPDATE OF conteudo`,
                    [id, usuarioId, companyId()],
                );
                if (!assessment.rows[0]) {
                    throw new AppError("Avaliação não encontrada ou não destinada ao seu setor.", 404);
                }
                const isTrainingProof = String(assessment.rows[0].tipo) === "TREINAMENTO";
                const minimumScore = isTrainingProof
                    ? Number(assessment.rows[0].prova_nota_minima)
                    : null;

                const questionsResult = await client.query(
                    `SELECT pergunta.id::text AS id, pergunta.texto,
                            alternativa.id::text AS alternativa_id,
                            alternativa.texto AS alternativa_texto, alternativa.correta
                     FROM public.rh_pergunta pergunta
                     JOIN public.rh_alternativa alternativa ON alternativa.id_pergunta = pergunta.id
                     WHERE pergunta.id_conteudo = $1
                     ORDER BY pergunta.ordem, alternativa.ordem`,
                    [id],
                );
                const questions = new Map<string, {
                    id: string;
                    texto: string;
                    alternativas: Array<{ id: string; texto: string; correta: boolean }>;
                }>();
                for (const row of questionsResult.rows) {
                    const questionId = String(row.id);
                    let question = questions.get(questionId);
                    if (!question) {
                        question = { id: questionId, texto: String(row.texto), alternativas: [] };
                        questions.set(questionId, question);
                    }
                    question.alternativas.push({
                        id: String(row.alternativa_id),
                        texto: String(row.alternativa_texto),
                        correta: Boolean(row.correta),
                    });
                }
                if (!questions.size) throw new AppError("Esta avaliação não possui perguntas.", 409);

                const answers = new Map(respostas.map((answer) => [answer.pergunta_id, answer.alternativa_id]));
                if (
                    answers.size !== questions.size ||
                    respostas.length !== questions.size ||
                    [...questions.keys()].some((questionId) => !answers.has(questionId))
                ) {
                    throw new AppError("Responda a todas as perguntas antes de enviar.", 400);
                }

                let correctCount = 0;
                for (const question of questions.values()) {
                    const selectedId = answers.get(question.id);
                    const selected = question.alternativas.find((alternative) => alternative.id === selectedId);
                    if (!selected) throw new AppError("Uma das alternativas selecionadas é inválida.", 400);
                    if (selected.correta) correctCount += 1;
                }

                const snapshots = [...questions.values()].map((question) => ({
                    id: question.id,
                    texto: question.texto,
                    alternativas: question.alternativas.map(({ id: alternativeId, texto }) => ({
                        id: alternativeId,
                        texto,
                        correta: question.alternativas.find((alternative) => alternative.id === alternativeId)?.correta ?? false,
                    })),
                }));
                const normalizedAnswers = [...answers].map(([pergunta_id, alternativa_id]) => ({
                    pergunta_id,
                    alternativa_id,
                }));
                const passed = minimumScore === null
                    ? null
                    : correctCount * 100 >= minimumScore * questions.size;
                await client.query(
                    `INSERT INTO public.rh_avaliacao_tentativa
                         (id_conteudo, id_usuario, perguntas_snapshot, respostas, acertos, total_perguntas,
                          nota_minima_snapshot, aprovado)
                     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
                    [
                        id, usuarioId, JSON.stringify(snapshots), JSON.stringify(normalizedAnswers),
                        correctCount, questions.size, minimumScore, passed,
                    ],
                );
                return {
                    acertos: correctCount,
                    total_perguntas: questions.size,
                    percentual: Math.round(correctCount * 100 / questions.size),
                    nota_minima: minimumScore,
                    aprovado: passed,
                };
            });
        } catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "23505") {
                throw new AppError("Você já realizou esta avaliação. Cada colaborador pode enviá-la uma única vez.", 409);
            }
            throw error;
        }
    },
};
