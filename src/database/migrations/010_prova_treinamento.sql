BEGIN;

ALTER TABLE public.rh_conteudo
    ADD COLUMN IF NOT EXISTS prova_ativa BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS prova_titulo VARCHAR(200),
    ADD COLUMN IF NOT EXISTS prova_descricao TEXT,
    ADD COLUMN IF NOT EXISTS prova_nota_minima SMALLINT NOT NULL DEFAULT 70
        CHECK (prova_nota_minima BETWEEN 0 AND 100);

ALTER TABLE public.rh_avaliacao_tentativa
    ADD COLUMN IF NOT EXISTS nota_minima_snapshot SMALLINT
        CHECK (nota_minima_snapshot BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS aprovado BOOLEAN;

ALTER TABLE public.rh_conteudo
    DROP CONSTRAINT IF EXISTS rh_conteudo_prova_tipo_check;

ALTER TABLE public.rh_conteudo
    ADD CONSTRAINT rh_conteudo_prova_tipo_check
        CHECK (tipo = 'TREINAMENTO' OR NOT prova_ativa);

COMMIT;
