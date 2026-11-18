BEGIN;

ALTER TABLE public.evento
    ADD COLUMN IF NOT EXISTS id_criador UUID REFERENCES public.usuario(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS data_evento DATE,
    ADD COLUMN IF NOT EXISTS horario TIME,
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(40) NOT NULL DEFAULT 'Equipe';

UPDATE public.evento
SET data_evento = (data_inicio AT TIME ZONE current_setting('TIMEZONE'))::date,
    horario = (data_inicio AT TIME ZONE current_setting('TIMEZONE'))::time
WHERE data_evento IS NULL OR horario IS NULL;

CREATE INDEX IF NOT EXISTS idx_evento_empresa_data
    ON public.evento (id_empresa, data_evento);
CREATE INDEX IF NOT EXISTS idx_evento_criador
    ON public.evento (id_criador);

COMMIT;
