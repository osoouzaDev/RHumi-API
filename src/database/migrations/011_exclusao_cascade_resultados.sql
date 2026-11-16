BEGIN;

ALTER TABLE public.rh_avaliacao_tentativa
    DROP CONSTRAINT IF EXISTS rh_avaliacao_tentativa_id_conteudo_fkey;

ALTER TABLE public.rh_avaliacao_tentativa
    ADD CONSTRAINT rh_avaliacao_tentativa_id_conteudo_fkey
        FOREIGN KEY (id_conteudo)
        REFERENCES public.rh_conteudo(id)
        ON DELETE CASCADE;

COMMIT;
