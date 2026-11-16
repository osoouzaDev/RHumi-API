BEGIN;

CREATE TABLE IF NOT EXISTS public.rh_conteudo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('TREINAMENTO', 'AVALIACAO')),
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    tipo_material VARCHAR(20) CHECK (tipo_material IN ('YOUTUBE', 'ARTIGO', 'PDF')),
    url_material TEXT,
    arquivo_pdf TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (tipo = 'TREINAMENTO' AND tipo_material IS NOT NULL)
        OR (tipo = 'AVALIACAO' AND tipo_material IS NULL
            AND url_material IS NULL AND arquivo_pdf IS NULL)
    ),
    CHECK (arquivo_pdf IS NULL OR tipo_material = 'PDF')
);

CREATE INDEX IF NOT EXISTS idx_rh_conteudo_empresa_tipo
    ON public.rh_conteudo (id_empresa, tipo, ativo, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rh_conteudo_setor (
    id_conteudo UUID NOT NULL REFERENCES public.rh_conteudo(id) ON DELETE CASCADE,
    id_setor UUID NOT NULL REFERENCES public.setor(id) ON DELETE RESTRICT,
    PRIMARY KEY (id_conteudo, id_setor)
);

CREATE TABLE IF NOT EXISTS public.rh_pergunta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conteudo UUID NOT NULL REFERENCES public.rh_conteudo(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    ordem INTEGER NOT NULL CHECK (ordem > 0),
    UNIQUE (id_conteudo, ordem)
);

CREATE TABLE IF NOT EXISTS public.rh_alternativa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pergunta UUID NOT NULL REFERENCES public.rh_pergunta(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    correta BOOLEAN NOT NULL DEFAULT FALSE,
    ordem INTEGER NOT NULL CHECK (ordem > 0),
    UNIQUE (id_pergunta, ordem)
);

CREATE TABLE IF NOT EXISTS public.rh_avaliacao_tentativa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conteudo UUID NOT NULL REFERENCES public.rh_conteudo(id) ON DELETE RESTRICT,
    id_usuario UUID NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
    perguntas_snapshot JSONB NOT NULL,
    respostas JSONB NOT NULL,
    acertos INTEGER NOT NULL CHECK (acertos >= 0),
    total_perguntas INTEGER NOT NULL CHECK (total_perguntas > 0),
    entregue_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_conteudo, id_usuario),
    CHECK (acertos <= total_perguntas)
);

CREATE INDEX IF NOT EXISTS idx_rh_avaliacao_usuario
    ON public.rh_avaliacao_tentativa (id_usuario, entregue_em DESC);

DROP TRIGGER IF EXISTS trg_rh_conteudo_updated_at ON public.rh_conteudo;

CREATE TRIGGER trg_rh_conteudo_updated_at
    BEFORE UPDATE ON public.rh_conteudo
    FOR EACH ROW EXECUTE FUNCTION public.atualizar_updated_at();

INSERT INTO public.rh_conteudo
    (id, id_empresa, tipo, titulo, descricao, tipo_material, url_material, ativo, created_at, updated_at)
SELECT treinamento.id, setor.id_empresa, 'TREINAMENTO', treinamento.titulo,
       treinamento.descricao,
       CASE treinamento.tipo_material
           WHEN 'VIDEO' THEN 'YOUTUBE'
           WHEN 'PDF' THEN 'PDF'
           ELSE 'ARTIGO'
       END,
       treinamento.url_material, treinamento.ativo, treinamento.created_at, treinamento.updated_at
FROM public.treinamento
JOIN public.setor ON setor.id = treinamento.id_setor
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rh_conteudo_setor (id_conteudo, id_setor)
SELECT treinamento.id, treinamento.id_setor
FROM public.treinamento
WHERE treinamento.id_setor IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
