import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { UpdateJourneyTaskDTO } from "./dto.js";

interface JourneyTask {
    key: string;
    title: string;
    concluida: boolean;
    concluida_em: string | null;
}

interface JourneyStage {
    key: string;
    title: string;
    description: string;
    indicator: {
        type: "boolean" | "percentage" | "count";
        title: string;
        description: string;
    };
    tasks: JourneyTask[];
}

const stages: Omit<JourneyStage, "tasks">[] = [
    {
        key: "pre-boarding",
        title: "Pré-boarding",
        description: "Preparação antes do primeiro dia",
        indicator: {
            type: "percentage",
            title: "Preparação concluída",
            description: "Percentual das tarefas pré-admissionais concluídas",
        },
    },
    {
        key: "primeiro-dia",
        title: "Primeiro dia",
        description: "Acolhimento e integração inicial",
        indicator: {
            type: "percentage",
            title: "Integração inicial",
            description: "Percentual das atividades do primeiro dia concluídas",
        },
    },
    {
        key: "primeira-semana",
        title: "Primeira semana",
        description: "Acompanhamento da primeira semana de trabalho",
        indicator: {
            type: "percentage",
            title: "Adaptação inicial",
            description: "Percentual das atividades da primeira semana concluídas",
        },
    },
    {
        key: "primeiro-mes",
        title: "Primeiro mês",
        description: "Acompanhamento e feedback do primeiro mês",
        indicator: {
            type: "percentage",
            title: "Acompanhamento do primeiro mês",
            description: "Percentual das atividades do primeiro mês concluídas",
        },
    },
];

const taskCatalog: Record<string, Omit<JourneyTask, "concluida" | "concluida_em">[]> = {
    "pre-boarding": [
        { key: "documentos-admissionais-enviados", title: "Documentos admissionais enviados" },
        { key: "contrato-assinado", title: "Contrato de trabalho assinado" },
        { key: "acessos-preparados", title: "Acessos e equipamentos preparados" },
    ],
    "primeiro-dia": [
        { key: "recepcao-realizada", title: "Recepção e apresentação da equipe realizadas" },
        { key: "orientacao-inicial-concluida", title: "Orientação inicial concluída" },
        { key: "ferramentas-apresentadas", title: "Ferramentas e espaço de trabalho apresentados" },
    ],
    "primeira-semana": [
        { key: "treinamento-inicial-concluido", title: "Treinamento inicial concluído" },
        { key: "metas-alinhadas", title: "Responsabilidades e metas alinhadas" },
        { key: "reuniao-de-acompanhamento", title: "Reunião de acompanhamento realizada" },
    ],
    "primeiro-mes": [
        { key: "feedback-inicial-realizado", title: "Feedback inicial realizado" },
        { key: "plano-de-desenvolvimento-alinhado", title: "Plano de desenvolvimento alinhado" },
        { key: "periodo-de-integracao-avaliado", title: "Período de integração avaliado" },
    ],
};

function companyId(): string {
    const id = process.env.DEFAULT_EMPRESA_ID?.trim();
    if (!id) {
        throw new AppError("DEFAULT_EMPRESA_ID não está configurada.", 500);
    }
    return id;
}

function timestamp(value: unknown): string | null {
    if (value == null) return null;
    return value instanceof Date ? value.toISOString() : String(value);
}

function tasksForStage(stageKey: string): Omit<JourneyTask, "concluida" | "concluida_em">[] {
    const tasks = taskCatalog[stageKey];
    if (!tasks) {
        throw new AppError(`A etapa "${stageKey}" não possui tarefas configuradas.`, 500);
    }
    return tasks;
}

export const journeysRepository = {
    async listar() {
        const idEmpresa = companyId();
        const [employeesResult, tasksResult] = await Promise.all([
            banco.query(
                `SELECT u.id::text AS id, u.email AS login, u.nome, u.email,
                        COALESCE(uc.classificacao, 'HR_ADMIN')::text AS classificacao,
                        u.ativo, u.created_at AS data_criacao,
                        u.updated_at AS data_atualizacao,
                        COALESCE(uc.telefone, u.telefone) AS telefone,
                        setor.nome_setor AS setor, uc.cargo, uc.tipo_contrato,
                        TO_CHAR(uc.data_admissao, 'YYYY-MM-DD') AS data_admissao,
                        uc.descricao_cargo
                 FROM usuario u
                 LEFT JOIN LATERAL (
                     SELECT colaborador.*
                     FROM usuario_colaborador colaborador
                     WHERE colaborador.id_empresa = u.id_empresa
                       AND (colaborador.id_usuario = u.id
                         OR LOWER(colaborador.email) = LOWER(u.email))
                     ORDER BY (colaborador.id_usuario = u.id) IS TRUE DESC,
                              colaborador.created_at DESC
                     LIMIT 1
                 ) uc ON TRUE
                 LEFT JOIN setor ON setor.id = uc.id_setor
                 WHERE u.id_empresa = $1 AND u.ativo = TRUE
                 ORDER BY u.nome`,
                [idEmpresa],
            ),
            banco.query(
                `SELECT tarefa.id_usuario::text AS id_usuario, tarefa.etapa, tarefa.tarefa,
                        tarefa.concluida, tarefa.concluida_em
                 FROM jornada_tarefa tarefa
                 JOIN usuario ON usuario.id = tarefa.id_usuario
                 WHERE usuario.id_empresa = $1`,
                [idEmpresa],
            ),
        ]);

        const completedTasks = new Map(
            tasksResult.rows.map((row) => [
                `${String(row.id_usuario)}:${String(row.etapa)}:${String(row.tarefa)}`,
                {
                    concluida: Boolean(row.concluida),
                    concluida_em: timestamp(row.concluida_em),
                },
            ]),
        );

        return employeesResult.rows.map((employee) => {
            const employeeId = String(employee.id);
            return {
                employee: {
                    id: employeeId,
                    login: String(employee.login),
                    nome: String(employee.nome),
                    email: String(employee.email),
                    classificacao: String(employee.classificacao),
                    ativo: Boolean(employee.ativo),
                    data_criacao: timestamp(employee.data_criacao) ?? "",
                    data_atualizacao: timestamp(employee.data_atualizacao) ?? "",
                    telefone: employee.telefone == null ? null : String(employee.telefone),
                    setor: employee.setor == null ? null : String(employee.setor),
                    cargo: employee.cargo == null ? null : String(employee.cargo),
                    tipo_contrato: employee.tipo_contrato == null
                        ? null
                        : String(employee.tipo_contrato),
                    data_admissao: employee.data_admissao == null
                        ? null
                        : String(employee.data_admissao),
                    descricao_cargo: employee.descricao_cargo == null
                        ? null
                        : String(employee.descricao_cargo),
                },
                stages: stages.map((stage) => ({
                    ...stage,
                    tasks: tasksForStage(stage.key).map((task) => {
                        const savedTask = completedTasks.get(
                            `${employeeId}:${stage.key}:${task.key}`,
                        );
                        return {
                            ...task,
                            concluida: savedTask?.concluida ?? false,
                            concluida_em: savedTask?.concluida_em ?? null,
                        };
                    }),
                })),
            };
        });
    },

    async atualizarTarefa(
        usuarioId: string,
        etapaKey: string,
        tarefaKey: string,
        data: UpdateJourneyTaskDTO,
    ): Promise<{ atualizado: true; concluida_em: string | null }> {
        const tasks = taskCatalog[etapaKey];
        if (!tasks?.some((task) => task.key === tarefaKey)) {
            throw new AppError("Etapa ou tarefa da jornada não encontrada.", 404);
        }

        const result = await banco.query(
            `INSERT INTO jornada_tarefa
                 (id_usuario, etapa, tarefa, concluida, concluida_em)
             SELECT usuario.id, $3, $4, $5,
                    CASE WHEN $5::boolean THEN NOW() ELSE NULL END
             FROM usuario
             WHERE usuario.id = $2 AND usuario.id_empresa = $1
             ON CONFLICT (id_usuario, etapa, tarefa)
             DO UPDATE SET concluida = EXCLUDED.concluida,
                           concluida_em = EXCLUDED.concluida_em,
                           updated_at = NOW()
             RETURNING concluida_em`,
            [companyId(), usuarioId, etapaKey, tarefaKey, data.concluida],
        );
        if (!result.rows[0]) {
            throw new AppError("Colaborador não encontrado.", 404);
        }
        return { atualizado: true, concluida_em: timestamp(result.rows[0].concluida_em) };
    },

    async reabrirEtapa(usuarioId: string, etapaKey: string): Promise<{ atualizado: true }> {
        if (!taskCatalog[etapaKey]) {
            throw new AppError("Etapa da jornada não encontrada.", 404);
        }

        const employeeResult = await banco.query(
            `SELECT id FROM usuario WHERE id = $1 AND id_empresa = $2`,
            [usuarioId, companyId()],
        );
        if (!employeeResult.rows[0]) {
            throw new AppError("Colaborador não encontrado.", 404);
        }

        await banco.query(
            `DELETE FROM jornada_tarefa
             WHERE id_usuario = $1 AND etapa = $2`,
            [usuarioId, etapaKey],
        );
        return { atualizado: true };
    },
};
