-- ===============================================================
-- RHumi - migration inicial do banco
-- ===============================================================
-- Objetivo:
--   Criar a base mínima de dados para suportar autenticação,
--   empresa/organização, colaboradores, setores, treinamentos e
--   auditoria operacional do sistema RHumi.
--
-- Observações:
--   - Mantém nomes em português para acompanhar o diagrama enviado.
--   - Usa UUID como identificador primário para facilitar escalabilidade,
--     integração e manutenção multiempresa.
--   - Todas as tabelas possuem created_at e updated_at para rastreio.
-- ===============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===============================================================
-- 1) Empresa / organização
-- ===============================================================
CREATE TABLE IF NOT EXISTS empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_empresa VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    rua VARCHAR(255),
    numero_end VARCHAR(20),
    bairro VARCHAR(120),
    cep VARCHAR(12),
    cidade VARCHAR(120),
    estado VARCHAR(2),
    telefone VARCHAR(30),
    email VARCHAR(255),
    fundacao DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empresa_cnpj ON empresa (cnpj);

-- ===============================================================
-- 2) Perfis / papéis do sistema
-- ===============================================================
CREATE TABLE IF NOT EXISTS perfil (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(80) NOT NULL UNIQUE,
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO perfil (nome, descricao)
VALUES
    ('HR_ADMIN', 'Administrador de recursos humanos e gestão da organização'),
    ('SUPERVISOR', 'Gestor responsável por equipe ou área específica'),
    ('EMPLOYEE', 'Colaborador com acesso ao próprio perfil e recursos pessoais'),
    ('CANDIDATE', 'Candidato externo com acesso ao processo seletivo')
ON CONFLICT (nome) DO NOTHING;

-- ===============================================================
-- 3) Usuários e autenticação
-- ===============================================================
CREATE TABLE IF NOT EXISTS usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(30),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_empresa, email)
);

CREATE INDEX IF NOT EXISTS idx_usuario_email ON usuario (email);
CREATE INDEX IF NOT EXISTS idx_usuario_empresa ON usuario (id_empresa);

CREATE TABLE IF NOT EXISTS usuario_perfil (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    id_perfil UUID NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_usuario, id_perfil)
);

CREATE TABLE IF NOT EXISTS sessao_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    ip_origem VARCHAR(45),
    user_agent TEXT,
    expira_em TIMESTAMPTZ NOT NULL,
    revogada_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessao_usuario ON sessao_usuario (id_usuario, revogada_em);

-- ===============================================================
-- 4) Setores / departamentos
-- ===============================================================
CREATE TABLE IF NOT EXISTS setor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    nome_setor VARCHAR(150) NOT NULL,
    icone VARCHAR(120),
    descricao TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_empresa, nome_setor)
);

CREATE INDEX IF NOT EXISTS idx_setor_empresa ON setor (id_empresa);

-- ===============================================================
-- 5) Colaborador / usuário-colaborador
-- ===============================================================
CREATE TABLE IF NOT EXISTS usuario_colaborador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    id_usuario UUID REFERENCES usuario(id) ON DELETE SET NULL,
    id_setor UUID REFERENCES setor(id) ON DELETE SET NULL,
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(30),
    classificacao VARCHAR(40) NOT NULL DEFAULT 'EMPLOYEE',
    cargo VARCHAR(150),
    tipo_contrato VARCHAR(50) NOT NULL CHECK (tipo_contrato IN ('CLT', 'PJ', 'TEMPORARIO', 'ESTAGIARIO')),
    data_admissao DATE,
    descricao_cargo TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'INATIVO', 'DESLIGADO', 'PENDENTE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_empresa, email)
);

CREATE INDEX IF NOT EXISTS idx_usuario_colaborador_empresa ON usuario_colaborador (id_empresa);
CREATE INDEX IF NOT EXISTS idx_usuario_colaborador_setor ON usuario_colaborador (id_setor);

-- ===============================================================
-- 6) Contrato de trabalho e histórico profissional
-- ===============================================================
CREATE TABLE IF NOT EXISTS contrato_trabalho (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_colaborador UUID NOT NULL REFERENCES usuario_colaborador(id) ON DELETE CASCADE,
    tipo_contrato VARCHAR(50) NOT NULL CHECK (tipo_contrato IN ('CLT', 'PJ', 'TEMPORARIO', 'ESTAGIARIO')),
    data_inicio DATE NOT NULL,
    data_fim DATE,
    salario NUMERIC(12,2) CHECK (salario >= 0),
    observacoes TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contrato_trabalho_colaborador ON contrato_trabalho (id_colaborador);

CREATE TABLE IF NOT EXISTS historico_setor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_colaborador UUID NOT NULL REFERENCES usuario_colaborador(id) ON DELETE CASCADE,
    id_setor UUID NOT NULL REFERENCES setor(id) ON DELETE RESTRICT,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    motivo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_cargo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_colaborador UUID NOT NULL REFERENCES usuario_colaborador(id) ON DELETE CASCADE,
    cargo VARCHAR(150) NOT NULL,
    descricao_cargo TEXT,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===============================================================
-- 7) Treinamentos / materiais / tratamento
-- ===============================================================
CREATE TABLE IF NOT EXISTS treinamento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_setor UUID REFERENCES setor(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    tipo_material VARCHAR(50) NOT NULL CHECK (tipo_material IN ('VIDEO', 'PDF', 'LINK', 'PRESENTATION', 'TXT')),
    url_material TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tratamento_setor ON tratamento (id_setor);

-- ===============================================================
-- 8) Eventos e público-alvo
-- ===============================================================
CREATE TABLE IF NOT EXISTS evento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
    titulo VARCHAR(200) NOT NULL,
    descricao TEXT,
    data_inicio TIMESTAMPTZ NOT NULL,
    data_fim TIMESTAMPTZ,
    tipo_publico VARCHAR(30) NOT NULL CHECK (tipo_publico IN ('TODOS', 'SETOR', 'PERSONALIZADO')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evento_setor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_evento UUID NOT NULL REFERENCES evento(id) ON DELETE CASCADE,
    id_setor UUID NOT NULL REFERENCES setor(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_evento, id_setor)
);

CREATE TABLE IF NOT EXISTS evento_colaborador (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_evento UUID NOT NULL REFERENCES evento(id) ON DELETE CASCADE,
    id_colaborador UUID NOT NULL REFERENCES usuario_colaborador(id) ON DELETE CASCADE,
    confirmado BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_evento, id_colaborador)
);

-- ===============================================================
-- 9) Auditoria e logs
-- ===============================================================
CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_empresa UUID REFERENCES empresa(id) ON DELETE SET NULL,
    id_usuario UUID REFERENCES usuario(id) ON DELETE SET NULL,
    entidade VARCHAR(120) NOT NULL,
    id_entidade UUID,
    operacao VARCHAR(40) NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'RESET_SENHA')),
    ip_origem VARCHAR(45),
    detalhes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria (id_empresa, created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria (entidade, id_entidade);

-- ===============================================================
-- 10) Trigger para atualizar updated_at automaticamente
-- ===============================================================
CREATE OR REPLACE FUNCTION atualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_empresa_updated_at'
    ) THEN
        CREATE TRIGGER trg_empresa_updated_at
        BEFORE UPDATE ON empresa
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_perfil_updated_at'
    ) THEN
        CREATE TRIGGER trg_perfil_updated_at
        BEFORE UPDATE ON perfil
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_usuario_updated_at'
    ) THEN
        CREATE TRIGGER trg_usuario_updated_at
        BEFORE UPDATE ON usuario
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_sessao_usuario_updated_at'
    ) THEN
        CREATE TRIGGER trg_sessao_usuario_updated_at
        BEFORE UPDATE ON sessao_usuario
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_setor_updated_at'
    ) THEN
        CREATE TRIGGER trg_setor_updated_at
        BEFORE UPDATE ON setor
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_usuario_colaborador_updated_at'
    ) THEN
        CREATE TRIGGER trg_usuario_colaborador_updated_at
        BEFORE UPDATE ON usuario_colaborador
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_contrato_trabalho_updated_at'
    ) THEN
        CREATE TRIGGER trg_contrato_trabalho_updated_at
        BEFORE UPDATE ON contrato_trabalho
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_tratamento_updated_at'
    ) THEN
        CREATE TRIGGER trg_tratamento_updated_at
        BEFORE UPDATE ON tratamento
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_evento_updated_at'
    ) THEN
        CREATE TRIGGER trg_evento_updated_at
        BEFORE UPDATE ON evento
        FOR EACH ROW EXECUTE FUNCTION atualizar_updated_at();
    END IF;
END $$;

-- ===============================================================
-- 11) Comentários de documentação para manutenção
-- ===============================================================
COMMENT ON TABLE empresa IS 'Tabela central da organização/empresa do RHumi.';
COMMENT ON TABLE perfil IS 'Perfis do sistema: HR_ADMIN, SUPERVISOR, EMPLOYEE, CANDIDATE.';
COMMENT ON TABLE usuario IS 'Usuários da plataforma, incluindo usuários administrativos e colaboradores.';
COMMENT ON TABLE sessao_usuario IS 'Sessões autenticadas com tokens e refresh tokens.';
COMMENT ON TABLE setor IS 'Departamentos ou setores da organização.';
COMMENT ON TABLE usuario_colaborador IS 'Dados cadastrais do colaborador/usuário da empresa.';
COMMENT ON TABLE contrato_trabalho IS 'Histórico e vigência de contratos do colaborador.';
COMMENT ON TABLE historico_setor IS 'Histórico de movimentação entre setores.';
COMMENT ON TABLE historico_cargo IS 'Histórico de cargos e promoções.';
COMMENT ON TABLE tratamento IS 'Treinamentos, materiais, conteúdos e recursos de acompanhamento.';
COMMENT ON TABLE evento IS 'Eventos da empresa e públicos-alvo.';
COMMENT ON TABLE auditoria IS 'Registro de ações sensíveis para compliance e rastreabilidade.';
