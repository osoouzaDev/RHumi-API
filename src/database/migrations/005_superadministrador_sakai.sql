BEGIN;

DO $$
DECLARE
    usuario_alvo UUID := '82e6ad33-f876-44a5-bd2d-de167cc69faf';
    empresa_alvo UUID;
    perfil_sakai UUID;
BEGIN
    SELECT id_empresa
    INTO empresa_alvo
    FROM public.usuario
    WHERE id = usuario_alvo;

    IF empresa_alvo IS NULL THEN
        RAISE EXCEPTION 'Usuário 82e6ad33-f876-44a5-bd2d-de167cc69faf não encontrado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.usuario_colaborador
        WHERE id_usuario = usuario_alvo
    ) THEN
        RAISE EXCEPTION 'O usuário informado não possui cadastro de colaborador vinculado.';
    END IF;

    INSERT INTO public.perfil (nome, descricao)
    VALUES ('sakai', 'Superadministrador com acesso total ao sistema RHumi')
    ON CONFLICT (nome) DO UPDATE
    SET descricao = EXCLUDED.descricao
    RETURNING id INTO perfil_sakai;

    UPDATE public.usuario_colaborador
    SET classificacao = 'sakai',
        updated_at = NOW()
    WHERE id_usuario = usuario_alvo;

    DELETE FROM public.usuario_perfil
    WHERE id_usuario = usuario_alvo;

    INSERT INTO public.usuario_perfil (id_usuario, id_perfil)
    VALUES (usuario_alvo, perfil_sakai)
    ON CONFLICT (id_usuario, id_perfil) DO NOTHING;
END;
$$;

COMMIT;
