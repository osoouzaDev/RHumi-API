BEGIN;

CREATE TABLE IF NOT EXISTS public.vaga (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
    titulo VARCHAR(150) NOT NULL,
    setor VARCHAR(150) NOT NULL,
    localidade VARCHAR(150),
    tipo_contrato VARCHAR(20) NOT NULL
        CHECK (tipo_contrato IN ('CLT', 'PJ', 'TEMPORARIO', 'ESTAGIARIO')),
    descricao TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'ABERTA'
        CHECK (status IN ('ABERTA', 'PAUSADA', 'ENCERRADA')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, id_empresa)
);

CREATE TABLE IF NOT EXISTS public.candidato (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(30),
    curriculo_url VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_empresa, email),
    UNIQUE (id, id_empresa)
);

CREATE TABLE IF NOT EXISTS public.candidatura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES public.empresa(id) ON DELETE CASCADE,
    id_vaga UUID NOT NULL,
    id_candidato UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NOVA'
        CHECK (status IN ('NOVA', 'EM_SELECAO', 'ENTREVISTA', 'CONTRATADA', 'REPROVADA')),
    origem VARCHAR(80) NOT NULL DEFAULT 'Manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_vaga, id_candidato),
    FOREIGN KEY (id_vaga, id_empresa)
        REFERENCES public.vaga(id, id_empresa) ON DELETE CASCADE,
    FOREIGN KEY (id_candidato, id_empresa)
        REFERENCES public.candidato(id, id_empresa) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vaga_empresa_status_created
    ON public.vaga (id_empresa, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidato_empresa_nome
    ON public.candidato (id_empresa, nome);
CREATE INDEX IF NOT EXISTS idx_candidatura_empresa_status_created
    ON public.candidatura (id_empresa, status, created_at DESC);

COMMIT;
