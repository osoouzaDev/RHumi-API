BEGIN;

ALTER TABLE public.usuario
    ALTER COLUMN codigo_colaborador DROP NOT NULL;

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

    IF UPPER(COALESCE(current_setting('rhumi.classificacao', TRUE), '')) = 'CANDIDATE' THEN
        RETURN NEW;
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

COMMENT ON COLUMN public.usuario.codigo_colaborador IS
    'Código único de quatro dígitos para colaboradores; contas de candidatos não recebem código.';

COMMIT;
