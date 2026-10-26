BEGIN;

DO $$
DECLARE
    empresa_id UUID;
BEGIN
    SELECT id_empresa
    INTO empresa_id
    FROM public.usuario
    WHERE id = '82e6ad33-f876-44a5-bd2d-de167cc69faf';

    IF empresa_id IS NULL THEN
        RAISE EXCEPTION 'Usuário 82e6ad33-f876-44a5-bd2d-de167cc69faf não encontrado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.usuario_colaborador
        WHERE id_usuario = '82e6ad33-f876-44a5-bd2d-de167cc69faf'
    ) THEN
        RAISE EXCEPTION 'O usuário informado não possui cadastro de colaborador vinculado.';
    END IF;

    UPDATE public.usuario_colaborador
    SET classificacao = 'HR_ADMIN',
        updated_at = NOW()
    WHERE id_usuario = '82e6ad33-f876-44a5-bd2d-de167cc69faf';

    INSERT INTO public.setor (id_empresa, nome_setor)
    VALUES
        (empresa_id, 'Tecnologia'),
        (empresa_id, 'Contábil'),
        (empresa_id, 'Fiscal'),
        (empresa_id, 'Departamento Pessoal'),
        (empresa_id, 'Legalização'),
        (empresa_id, 'Marketing'),
        (empresa_id, 'Comercial'),
        (empresa_id, 'Financeiro'),
        (empresa_id, 'Sucesso do Cliente')
    ON CONFLICT (id_empresa, nome_setor) DO NOTHING;
END;
$$;

COMMIT;
