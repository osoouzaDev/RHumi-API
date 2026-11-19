BEGIN;

CREATE TABLE IF NOT EXISTS public.candidato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(30),
    curriculo_url VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_empresa, email),
    UNIQUE (id, id_empresa)
);

CREATE INDEX IF NOT EXISTS idx_candidato_empresa_nome
    ON public.candidato (id_empresa, nome);

ALTER TABLE public.candidatura
    ADD COLUMN IF NOT EXISTS id_candidato UUID;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'candidatura'
          AND column_name = 'id_usuario'
    ) THEN
        EXECUTE $backfill$
            WITH candidate_sources AS (
                SELECT candidatura.id_empresa,
                       LOWER(COALESCE(
                           NULLIF(BTRIM(candidatura.email), ''),
                           NULLIF(BTRIM(usuario.email), ''),
                           'candidato-' || candidatura.id::text || '@rhumi.invalid'
                       )) AS email,
                       COALESCE(
                           NULLIF(BTRIM(candidatura.nome), ''),
                           NULLIF(BTRIM(usuario.nome), ''),
                           'Candidato'
                       ) AS nome,
                       COALESCE(
                           NULLIF(BTRIM(candidatura.telefone), ''),
                           NULLIF(BTRIM(usuario.telefone), '')
                       ) AS telefone,
                       candidatura.created_at
                FROM public.candidatura
                LEFT JOIN public.usuario
                  ON usuario.id = candidatura.id_usuario
                 AND usuario.id_empresa = candidatura.id_empresa
                WHERE candidatura.id_candidato IS NULL
            )
            INSERT INTO public.candidato (id_empresa, nome, email, telefone)
            SELECT DISTINCT ON (id_empresa, email)
                   id_empresa, nome, email, telefone
            FROM candidate_sources
            ORDER BY id_empresa, email, created_at
            ON CONFLICT (id_empresa, email) DO UPDATE
                SET nome = EXCLUDED.nome,
                    telefone = COALESCE(EXCLUDED.telefone, public.candidato.telefone),
                    updated_at = NOW()
        $backfill$;

        EXECUTE $link$
            UPDATE public.candidatura
            SET id_candidato = (
                SELECT candidato.id
                FROM public.candidato
                LEFT JOIN public.usuario
                  ON usuario.id = candidatura.id_usuario
                 AND usuario.id_empresa = candidatura.id_empresa
                WHERE candidato.id_empresa = candidatura.id_empresa
                  AND LOWER(candidato.email) = LOWER(COALESCE(
                      NULLIF(BTRIM(candidatura.email), ''),
                      NULLIF(BTRIM(usuario.email), ''),
                      'candidato-' || candidatura.id::text || '@rhumi.invalid'
                  ))
                LIMIT 1
            )
            WHERE candidatura.id_candidato IS NULL
        $link$;
    END IF;
END
$$;

ALTER TABLE public.candidatura
    ALTER COLUMN id_candidato SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.candidatura'::regclass
          AND conname = 'candidatura_id_candidato_id_empresa_fkey'
    ) THEN
        ALTER TABLE public.candidatura
            ADD CONSTRAINT candidatura_id_candidato_id_empresa_fkey
            FOREIGN KEY (id_candidato, id_empresa)
            REFERENCES public.candidato (id, id_empresa)
            ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.candidatura'::regclass
          AND conname = 'candidatura_id_vaga_id_candidato_key'
    ) THEN
        ALTER TABLE public.candidatura
            ADD CONSTRAINT candidatura_id_vaga_id_candidato_key
            UNIQUE (id_vaga, id_candidato);
    END IF;
END
$$;

COMMIT;
