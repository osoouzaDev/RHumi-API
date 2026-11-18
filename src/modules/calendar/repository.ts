import type { PoolClient } from "pg";
import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CalendarEvent, CalendarSector, CreateCalendarEventDTO } from "./dto.js";

interface UserCalendarContext {
    id_empresa: string;
    id_setor: string | null;
}

async function getUserContext(userId: string): Promise<UserCalendarContext> {
    const result = await banco.query(
        `SELECT u.id_empresa::text AS id_empresa, colaborador.id_setor::text AS id_setor
         FROM public.usuario u
         LEFT JOIN LATERAL (
             SELECT uc.id_setor
             FROM public.usuario_colaborador uc
             JOIN public.setor s ON s.id = uc.id_setor AND s.id_empresa = uc.id_empresa
             WHERE uc.id_empresa = u.id_empresa
               AND uc.status = 'ATIVO'
               AND (uc.id_usuario = u.id OR LOWER(uc.email) = LOWER(u.email))
             ORDER BY (uc.id_usuario = u.id) IS TRUE DESC, uc.created_at DESC
             LIMIT 1
         ) colaborador ON TRUE
         WHERE u.id = $1 AND u.ativo = TRUE`,
        [userId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError("Usuário não encontrado ou inativo.", 404);
    return {
        id_empresa: String(row.id_empresa),
        id_setor: row.id_setor == null ? null : String(row.id_setor),
    };
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

function mapEvent(row: Record<string, unknown>): CalendarEvent {
    return {
        id: String(row.id),
        titulo: String(row.titulo),
        data: String(row.data),
        horario: String(row.horario).slice(0, 5),
        categoria: String(row.categoria),
        escopo: row.escopo as CalendarEvent["escopo"],
        id_setor: row.id_setor == null ? null : String(row.id_setor),
        nome_setor: row.nome_setor == null ? null : String(row.nome_setor),
        id_criador: row.id_criador == null ? null : String(row.id_criador),
    };
}

export const calendarRepository = {
    async listarSetoresDoUsuario(userId: string): Promise<UserCalendarContext> {
        return getUserContext(userId);
    },

    async listarSetores(userId: string): Promise<CalendarSector[]> {
        const context = await getUserContext(userId);
        const result = await banco.query(
            `SELECT id::text, nome_setor
             FROM public.setor
             WHERE id_empresa = $1
             ORDER BY nome_setor`,
            [context.id_empresa],
        );
        return result.rows.map((row) => ({
            id: String(row.id),
            nome_setor: String(row.nome_setor),
        }));
    },

    async listar(userId: string): Promise<CalendarEvent[]> {
        const context = await getUserContext(userId);
        const result = await banco.query(
            `SELECT e.id::text, e.titulo,
                    COALESCE(e.data_evento, (e.data_inicio AT TIME ZONE current_setting('TIMEZONE'))::date)::text AS data,
                    COALESCE(TO_CHAR(e.horario, 'HH24:MI'), TO_CHAR(e.data_inicio AT TIME ZONE current_setting('TIMEZONE'), 'HH24:MI')) AS horario,
                    e.categoria, e.id_criador::text,
                    CASE e.tipo_publico
                        WHEN 'TODOS' THEN 'EMPRESA'
                        WHEN 'SETOR' THEN 'SETOR'
                        ELSE 'PESSOAL'
                    END AS escopo,
                    setor.id::text AS id_setor, setor.nome_setor
             FROM public.evento e
             LEFT JOIN LATERAL (
                 SELECT s.id, s.nome_setor
                 FROM public.evento_setor es
                 JOIN public.setor s ON s.id = es.id_setor
                 WHERE es.id_evento = e.id
                 ORDER BY s.nome_setor
                 LIMIT 1
             ) setor ON TRUE
             WHERE e.id_empresa = $1
               AND (
                   e.tipo_publico = 'TODOS'
                   OR (
                       e.tipo_publico = 'SETOR'
                       AND EXISTS (
                           SELECT 1
                           FROM public.evento_setor es
                           WHERE es.id_evento = e.id AND es.id_setor = $3
                       )
                   )
                   OR (
                       e.tipo_publico = 'PERSONALIZADO'
                       AND (
                           e.id_criador = $2
                           OR EXISTS (
                               SELECT 1
                               FROM public.evento_colaborador ec
                               JOIN public.usuario_colaborador uc ON uc.id = ec.id_colaborador
                               JOIN public.usuario u ON u.id = $2
                               WHERE ec.id_evento = e.id
                                 AND (uc.id_usuario = u.id OR LOWER(uc.email) = LOWER(u.email))
                           )
                       )
                   )
               )
             ORDER BY data, horario, e.created_at`,
            [context.id_empresa, userId, context.id_setor],
        );
        return result.rows.map(mapEvent);
    },

    async criar(
        userId: string,
        data: CreateCalendarEventDTO,
        escopo: CalendarEvent["escopo"],
        idSetor: string | null,
    ): Promise<CalendarEvent> {
        const context = await getUserContext(userId);
        return transaction(async (client) => {
            const tipoPublico = escopo === "EMPRESA" ? "TODOS" : escopo === "SETOR" ? "SETOR" : "PERSONALIZADO";
            const result = await client.query(
                `INSERT INTO public.evento
                    (id_empresa, id_criador, titulo, data_inicio, data_evento, horario, categoria, tipo_publico)
                 VALUES
                    ($1, $2, $3, ($4::date + $5::time) AT TIME ZONE current_setting('TIMEZONE'),
                     $4::date, $5::time, $6, $7)
                 RETURNING id::text, titulo, data_evento::text AS data,
                           TO_CHAR(horario, 'HH24:MI') AS horario, categoria,
                           id_criador::text`,
                [context.id_empresa, userId, data.titulo, data.data, data.horario, data.categoria, tipoPublico],
            );
            const row = result.rows[0];
            let nomeSetor: string | null = null;
            if (idSetor) {
                const sector = await client.query(
                    `SELECT nome_setor
                     FROM public.setor
                     WHERE id = $1 AND id_empresa = $2`,
                    [idSetor, context.id_empresa],
                );
                if (!sector.rows[0]) throw new AppError("O setor selecionado não pertence à sua empresa.", 400);
                nomeSetor = String(sector.rows[0].nome_setor);
                await client.query(
                    `INSERT INTO public.evento_setor (id_evento, id_setor) VALUES ($1, $2)`,
                    [row.id, idSetor],
                );
            }
            return mapEvent({
                ...row,
                escopo,
                id_setor: idSetor,
                nome_setor: nomeSetor,
            });
        });
    },

    async excluir(userId: string, eventId: string): Promise<void> {
        const context = await getUserContext(userId);
        const result = await banco.query(
            `DELETE FROM public.evento
             WHERE id = $1 AND id_empresa = $2 AND id_criador = $3
             RETURNING id`,
            [eventId, context.id_empresa, userId],
        );
        if (!result.rowCount) throw new AppError("Evento não encontrado ou sem permissão para removê-lo.", 404);
    },
};
