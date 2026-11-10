BEGIN;

ALTER TABLE public.usuario_colaborador
    ALTER COLUMN tipo_contrato DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuario_colaborador_id_usuario
    ON public.usuario_colaborador (id_usuario);

CREATE INDEX IF NOT EXISTS idx_usuario_colaborador_email_lower
    ON public.usuario_colaborador (LOWER(email));

COMMENT ON COLUMN public.usuario_colaborador.tipo_contrato IS
    'Tipo de contrato do colaborador; pode ficar vazio enquanto a informação não for cadastrada.';

COMMIT;
