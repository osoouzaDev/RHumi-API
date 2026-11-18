BEGIN;

ALTER TABLE public.rh_conteudo
    ADD COLUMN IF NOT EXISTS nome_arquivo_pdf TEXT;

COMMIT;
