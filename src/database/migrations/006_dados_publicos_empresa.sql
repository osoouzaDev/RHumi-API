BEGIN;

ALTER TABLE public.empresa
    ADD COLUMN IF NOT EXISTS sobre_empresa TEXT,
    ADD COLUMN IF NOT EXISTS nome_pagina_carreiras VARCHAR(255),
    ADD COLUMN IF NOT EXISTS homepage_carreiras VARCHAR(500),
    ADD COLUMN IF NOT EXISTS chamada_carreiras VARCHAR(500),
    ADD COLUMN IF NOT EXISTS descricao_carreiras TEXT,
    ADD COLUMN IF NOT EXISTS missao TEXT,
    ADD COLUMN IF NOT EXISTS visao TEXT,
    ADD COLUMN IF NOT EXISTS valores TEXT;

COMMIT;
