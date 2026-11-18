BEGIN;

CREATE INDEX IF NOT EXISTS idx_sessao_usuario_access_hash
    ON public.sessao_usuario (token_hash)
    WHERE revogada_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessao_usuario_refresh_hash
    ON public.sessao_usuario (refresh_token_hash)
    WHERE revogada_em IS NULL;

COMMIT;
