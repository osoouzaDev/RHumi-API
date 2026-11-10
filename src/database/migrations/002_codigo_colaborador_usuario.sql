BEGIN;

ALTER TABLE public.usuario
    ADD COLUMN codigo_colaborador VARCHAR(4);

DO $$
DECLARE
    total_usuarios INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_usuarios
    FROM public.usuario;

    IF total_usuarios > 10000 THEN
        RAISE EXCEPTION
            'Não é possível gerar códigos de quatro dígitos: existem % usuários e o limite é 10000.',
            total_usuarios;
    END IF;
END;
$$;

WITH codigos_aleatorios AS (
    SELECT
        id,
        LPAD((ROW_NUMBER() OVER (ORDER BY RANDOM()) - 1)::TEXT, 4, '0') AS codigo
    FROM public.usuario
)
UPDATE public.usuario AS usuario
SET codigo_colaborador = codigos_aleatorios.codigo
FROM codigos_aleatorios
WHERE usuario.id = codigos_aleatorios.id;

ALTER TABLE public.usuario
    ALTER COLUMN codigo_colaborador SET NOT NULL,
    ADD CONSTRAINT usuario_codigo_colaborador_formato
        CHECK (codigo_colaborador ~ '^[0-9]{4}$'),
    ADD CONSTRAINT usuario_codigo_colaborador_unico
        UNIQUE (codigo_colaborador);

CREATE TABLE public.codigo_colaborador_emitido (
    codigo_colaborador VARCHAR(4) PRIMARY KEY
        CHECK (codigo_colaborador ~ '^[0-9]{4}$'),
    emitido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.codigo_colaborador_emitido (codigo_colaborador)
SELECT codigo_colaborador
FROM public.usuario;

CREATE OR REPLACE FUNCTION public.gerar_codigo_colaborador_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    codigo_inicial INTEGER;
    tentativa INTEGER;
    codigo_candidato VARCHAR(4);
    codigos_emitidos INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.codigo_colaborador IS DISTINCT FROM OLD.codigo_colaborador THEN
            RAISE EXCEPTION 'O código do colaborador não pode ser alterado.'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.codigo_colaborador IS NOT NULL THEN
        RAISE EXCEPTION 'O código do colaborador é gerado automaticamente.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM pg_advisory_xact_lock(1380533325);

    SELECT COUNT(*) INTO codigos_emitidos
    FROM public.codigo_colaborador_emitido;

    IF codigos_emitidos >= 10000 THEN
        RAISE EXCEPTION 'Todos os códigos de colaborador de quatro dígitos já foram emitidos.'
            USING ERRCODE = '23514';
    END IF;

    codigo_inicial := FLOOR(RANDOM() * 10000)::INTEGER;

    FOR tentativa IN 0..9999 LOOP
        codigo_candidato := LPAD(((codigo_inicial + tentativa) % 10000)::TEXT, 4, '0');

        BEGIN
            INSERT INTO public.codigo_colaborador_emitido (codigo_colaborador)
            VALUES (codigo_candidato);

            NEW.codigo_colaborador := codigo_candidato;
            RETURN NEW;
        EXCEPTION
            WHEN unique_violation THEN
                NULL;
        END;
    END LOOP;

    RAISE EXCEPTION 'Não há códigos de colaborador disponíveis.'
        USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_usuario_gerar_codigo_colaborador
    BEFORE INSERT OR UPDATE ON public.usuario
    FOR EACH ROW
    EXECUTE FUNCTION public.gerar_codigo_colaborador_usuario();

COMMENT ON COLUMN public.usuario.codigo_colaborador IS
    'Código único de quatro dígitos usado pelo colaborador para entrar no sistema.';

COMMENT ON TABLE public.codigo_colaborador_emitido IS
    'Registro permanente de códigos emitidos, para impedir que um código seja reutilizado.';

COMMIT;
