import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { banco } from "../../database/connection.js";

export interface SessionMetadata {
    ipOrigen?: string;
    userAgent?: string;
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
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

export const authSessionRepository = {
    async create(
        userId: string,
        accessToken: string,
        refreshToken: string,
        refreshExpiresAt: Date,
        metadata: SessionMetadata = {},
    ): Promise<void> {
        await banco.query(
            `INSERT INTO public.sessao_usuario
                (id_usuario, token_hash, refresh_token_hash, ip_origem, user_agent, expira_em)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                userId,
                hashToken(accessToken),
                hashToken(refreshToken),
                metadata.ipOrigen ?? null,
                metadata.userAgent ?? null,
                refreshExpiresAt,
            ],
        );
    },

    async accessTokenIsActive(userId: string, accessToken: string): Promise<boolean> {
        const result = await banco.query(
            `SELECT 1
             FROM public.sessao_usuario sessao
             JOIN public.usuario usuario ON usuario.id = sessao.id_usuario
             WHERE sessao.id_usuario = $1
               AND sessao.token_hash = $2
               AND sessao.revogada_em IS NULL
               AND sessao.expira_em > NOW()
               AND usuario.ativo = TRUE
             LIMIT 1`,
            [userId, hashToken(accessToken)],
        );
        return result.rowCount > 0;
    },

    async rotate(
        userId: string,
        oldRefreshToken: string,
        accessToken: string,
        refreshToken: string,
        refreshExpiresAt: Date,
    ): Promise<boolean> {
        return transaction(async (client) => {
            const currentSession = await client.query(
                `SELECT sessao.id
                 FROM public.sessao_usuario sessao
                 JOIN public.usuario usuario ON usuario.id = sessao.id_usuario
                 WHERE sessao.id_usuario = $1
                   AND sessao.refresh_token_hash = $2
                   AND sessao.revogada_em IS NULL
                   AND sessao.expira_em > NOW()
                   AND usuario.ativo = TRUE
                 FOR UPDATE OF sessao`,
                [userId, hashToken(oldRefreshToken)],
            );
            const sessionId = currentSession.rows[0]?.id;
            if (!sessionId) return false;

            const updated = await client.query(
                `UPDATE public.sessao_usuario
                 SET token_hash = $2,
                     refresh_token_hash = $3,
                     expira_em = $4,
                     updated_at = NOW()
                 WHERE id = $1 AND revogada_em IS NULL`,
                [sessionId, hashToken(accessToken), hashToken(refreshToken), refreshExpiresAt],
            );
            return updated.rowCount === 1;
        });
    },

    async revoke(accessToken?: string, refreshToken?: string): Promise<void> {
        const accessHash = accessToken ? hashToken(accessToken) : null;
        const refreshHash = refreshToken ? hashToken(refreshToken) : null;
        if (!accessHash && !refreshHash) return;

        await banco.query(
            `UPDATE public.sessao_usuario
             SET revogada_em = COALESCE(revogada_em, NOW()),
                 updated_at = NOW()
             WHERE revogada_em IS NULL
               AND (($1::text IS NOT NULL AND token_hash = $1)
                 OR ($2::text IS NOT NULL AND refresh_token_hash = $2))`,
            [accessHash, refreshHash],
        );
    },
};
