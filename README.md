# RHumi API

<div align="center">

**Backend de gestão de recursos humanos e desenvolvimento organizacional**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-7+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](https://opensource.org/license/isc-license-txt)

API REST responsável por autenticação, gestão de colaboradores, empresas, jornadas,
recrutamento, treinamentos, calendário e relatórios do ecossistema RHumi.

</div>

---

## Visão geral

O RHumi centraliza os processos estratégicos e operacionais de RH em uma única API:

| Área | Recursos |
|---|---|
| **Identidade e acesso** | Login por e-mail/senha ou código, perfil autenticado, refresh rotativo e logout |
| **Colaboradores** | Cadastro, consulta, atualização, senhas, setores, cargos e contratos |
| **Organização** | Dados da empresa, setores, classificações e contexto empresarial |
| **Jornadas** | Etapas de integração/desenvolvimento e acompanhamento de tarefas |
| **Recrutamento** | Vagas públicas e internas, candidatos e etapas de candidatura |
| **Aprendizagem** | Treinamentos, avaliações, provas, PDFs e histórico de desempenho |
| **Calendário** | Eventos pessoais, por setor e compartilhados pela empresa |
| **Gestão** | Catálogo e emissão de relatórios em JSON ou CSV |

## Funcionalidades

- Sessões HTTP seguras com access token e refresh token em cookies `HttpOnly`
- Autenticação complementar por header `Authorization: Bearer`
- Controle de acesso por perfil: colaborador, gestor, administrador e superadministrador
- Validação de parâmetros, consulta e corpo das requisições com Zod
- Pool de conexões PostgreSQL com suporte a SSL, CA customizada e banco gerenciado
- Proteção por Helmet, CORS explícito, CSRF para requisições autenticadas por cookie,
  limite global de requisições e tamanho máximo de body
- Health check público com estado da aplicação e da conexão PostgreSQL
- Anexos de treinamento enviados ao Google Drive ou armazenados localmente
- Respostas de avaliações corrigidas no servidor e snapshots históricos de conteúdo
- Rotas públicas isoladas para vagas e dados necessários ao site de carreiras

---

## Arquitetura

A aplicação usa uma arquitetura em camadas por domínio funcional:

```text
src/
├── app.ts                 Montagem dos middlewares e routers
├── server.ts              Inicialização HTTP e ciclo de vida do processo
├── config/                Ambiente, CORS, rate limit e logger
├── database/              Pool PostgreSQL e migrations
├── middlewares/           Autenticação, RBAC, CSRF e tratamento de erros
├── modules/               Controllers, DTOs, serviços e repositórios
│   ├── auth/
│   ├── calendar/
│   ├── company/
│   ├── health/
│   ├── journeys/
│   ├── learning/
│   ├── recruitment/
│   ├── reports/
│   └── users/
├── routes/                Definição pública das rotas HTTP
├── shared/                Erros e formatos de resposta
└── utils/                 Utilidades compartilhadas
```

Cada módulo concentra as regras do seu domínio, separando transporte HTTP,
validação, aplicação e persistência.

---

## Tecnologias

- **Runtime:** Node.js
- **Linguagem:** TypeScript
- **Framework HTTP:** Express 5
- **Banco de dados:** PostgreSQL com `pg`
- **Validação:** Zod
- **Autenticação:** JWT em cookies HttpOnly
- **Segurança:** Helmet, CORS, rate limit e proteção CSRF
- **Integração:** Google Drive API
- **Uploads:** Multer
- **Logs:** Pino
- **Testes:** Node Test Runner via `tsx`

---

## Pré-requisitos

- Node.js 22 ou superior
- npm
- PostgreSQL 13 ou superior
- Acesso a um banco PostgreSQL criado para o RHumi

---

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar o arquivo de ambiente

```bash
cp .env.example .env
```

No PowerShell, use:

```powershell
Copy-Item .env.example .env
```

### 3. Configurar variáveis essenciais

```dotenv
NODE_ENV=development
PORT=3333
CORS_ALLOWED_ORIGINS=http://localhost:4200

JWT_SECRET=uma-chave-longa-de-pelo-menos-32-caracteres
PASSWORD_PEPPER=um-pepper-longo-de-pelo-menos-32-caracteres
JWT_ISSUER=rhumi-api
JWT_AUDIENCE=rhumi-web

DATABASE_URL=postgresql://usuario:senha@host:5432/rhumi
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MAX=10

DEFAULT_EMPRESA_ID=uuid-da-empresa
```

> `JWT_SECRET`, `PASSWORD_PEPPER`, `JWT_ISSUER` e `JWT_AUDIENCE` são obrigatórios.
> Gere valores reais e não reutilize exemplos em ambientes compartilhados.

O banco também pode ser configurado por parâmetros separados:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rhumi
DB_USER=postgres
DB_PASSWORD=senha
```

Quando `DATABASE_URL` estiver definida, ela tem prioridade sobre os parâmetros separados.

### Variáveis disponíveis

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta HTTP | `8000` |
| `NODE_ENV` | Ambiente da aplicação | `development` |
| `CORS_ALLOWED_ORIGINS` | Origens separadas por vírgula | — |
| `LOG_LEVEL` | Nível de log Pino | `info` |
| `JWT_SECRET` | Chave para assinatura dos JWT | Obrigatória |
| `PASSWORD_PEPPER` | Pepper aplicado ao armazenamento de senhas | Obrigatório |
| `JWT_ISSUER` | Emissor esperado nos tokens | Obrigatório |
| `JWT_AUDIENCE` | Audiência esperada nos tokens | Obrigatório |
| `ACCESS_TOKEN_TTL_SECONDS` | Validade do access token, máximo 600 segundos | `600` |
| `REFRESH_TOKEN_TTL_DAYS` | Validade do refresh token | `30` |
| `REFRESH_TOKEN_COOKIE_MAX_AGE_SEC` | Validade específica do cookie de refresh | Derivado do TTL |
| `AUTH_COOKIE_SECURE` | Envia cookies apenas por HTTPS | `true` em produção |
| `AUTH_COOKIE_SAME_SITE` | Política SameSite: `lax`, `strict` ou `none` | `lax` local, `none` produção |
| `AUTH_COOKIE_DOMAIN` | Domínio opcional dos cookies | — |
| `ACCESS_TOKEN_COOKIE_NAME` | Nome do cookie de access token | `access_token` |
| `REFRESH_TOKEN_COOKIE_NAME` | Nome do cookie de refresh token | `refresh_token` |
| `DATABASE_URL` | URI completa do PostgreSQL | — |
| `DATABASE_SSL` | Habilita SSL PostgreSQL | `false` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Valida certificado do servidor | `true` |
| `DATABASE_CA_PATH` | Caminho da CA personalizada | — |
| `DB_SSL_CA_PEM` | Conteúdo PEM da CA personalizado | — |
| `DATABASE_POOL_MAX` | Máximo de conexões no pool | `10` |
| `DEFAULT_EMPRESA_ID` | UUID da empresa usada em áreas públicas e contextos compartilhados | Obrigatório em módulos dependentes |
| `TRAINING_PDF_DIR` | Diretório persistente dos PDFs locais | `./storage/training-pdfs` |

---

## Banco de dados e migrations

Todas as migrations estão em `src/database/migrations/`.

Aplique-as em ordem numérica no PostgreSQL:

```text
001_rhumi_core_schema.sql
002_codigo_colaborador_usuario.sql
003_colaborador_tipo_contrato_opcional.sql
004_administrador_e_setores_empresa.sql
005_superadministrador_sakai.sql
006_dados_publicos_empresa.sql
007_jornadas_recrutamento.sql
007_recrutamento.sql
008_codigo_colaborador_opcional_candidato.sql
009_treinamentos_avaliacoes.sql
010_prova_treinamento.sql
011_exclusao_cascade_resultados.sql
012_nome_arquivo_pdf.sql
013_calendario_compartilhado.sql
014_sessoes_autenticacao.sql
015_recrutamento_candidatos.sql
```

As migrations posteriores possuem `IF NOT EXISTS` ou verificações de compatibilidade
sempre que isso é necessário para preservar dados existentes. Antes de iniciar,
registre a empresa alvo em `public.empresa` e informe seu UUID em `DEFAULT_EMPRESA_ID`.

### Google Drive para PDFs

A integração usa OAuth por refresh token. Configure:

```dotenv
GOOGLE_DRIVE_TRAINING_FOLDER_ID=
GOOGLE_DRIVE_OAUTH_CLIENT_ID=
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=
GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=
GOOGLE_DRIVE_OAUTH_REDIRECT_URI=http://localhost:3001/oauth2/callback
```

Autorize a conta executando:

```bash
npm run authorize:google-drive
```

Sem a integração completa, os PDFs continuam disponíveis no diretório configurado
por `TRAINING_PDF_DIR` ou no diretório padrão `./storage/training-pdfs`.

---

## Executando

### Desenvolvimento

```bash
npm run dev
```

Por padrão com o `.env.example`, a API atende em:

```text
http://localhost:3333
```

### Build de produção

```bash
npm run build
npm start
```

O build gera JavaScript em `dist/`. A inicialização de produção executa
`dist/server.js`.

### Verificação de tipos

```bash
npm run typecheck
```

---

## Rotas da API

Todas as respostas seguem um formato consistente e são validadas antes dos
controllers processarem os dados.

### Monitoramento

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/health` | Público | Health check legado |
| `GET` | `/api/health` | Público | Health check completo da API e banco |

O banco indisponível retorna **503** com `status: "degraded"`.

### Autenticação e sessão

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/api/auth/login` | Público | Login por e-mail/senha ou código do colaborador |
| `POST` | `/api/auth/login/codigo` | Público | Login direto por código |
| `POST` | `/api/auth/refresh` | Público | Rotação do refresh token |
| `POST` | `/api/auth/logout` | Público | Encerramento e revogação da sessão |
| `GET` | `/api/auth/me` | Autenticado | Dados do usuário autenticado |

### Usuários e setores

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/setores` | Autenticado | Lista setores disponíveis |
| `GET` | `/api/usuarios` | Autenticado | Lista usuários com filtros e paginação |
| `GET` | `/api/usuarios/:id` | Autenticado | Consulta usuário por ID |
| `POST` | `/api/usuarios` | Admin | Cria colaborador |
| `PUT` | `/api/usuarios/:id` | Admin ou próprio usuário | Atualização parcial dos dados |
| `PATCH` | `/api/usuarios/:id/senha` | Admin | Altera senha de usuário |
| `PATCH` | `/api/usuarios/:id/reset-senha` | Admin | Redefine senha diretamente |
| `PATCH` | `/api/usuarios/eu/senha` | Autenticado | Altera a própria senha |
| `DELETE` | `/api/usuarios/:id` | Admin | Remove usuário |

### Empresa

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/empresa` | Autenticado | Dados da empresa |
| `PUT` | `/api/empresa` | Admin | Atualiza dados corporativos |
| `POST` | `/api/empresa/setores` | Admin | Adiciona setor |
| `DELETE` | `/api/empresa/setores/:id` | Admin | Remove setor vazio |

### Jornadas

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/jornadas` | Autenticado | Lista jornadas e tarefas |
| `PATCH` | `/api/jornadas/:usuarioId/etapas/:etapaKey/tarefas/:tarefaKey` | Admin | Atualiza tarefa da jornada |
| `DELETE` | `/api/jornadas/:usuarioId/etapas/:etapaKey` | Admin | Reabre uma etapa |

### Recrutamento

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/public/vagas` | Público | Lista vagas abertas |
| `GET` | `/api/recrutamento/vagas` | Autenticado | Lista vagas da empresa |
| `POST` | `/api/recrutamento/vagas` | Admin | Cadastra vaga |
| `PATCH` | `/api/recrutamento/vagas/:id/status` | Admin | Pausa ou reabre vaga |
| `GET` | `/api/recrutamento/candidaturas` | Autenticado | Lista candidaturas |
| `POST` | `/api/recrutamento/candidaturas` | Admin | Cadastra candidatura |
| `PATCH` | `/api/recrutamento/candidaturas/:id/status` | Admin | Atualiza etapa da candidatura |

### Capacitações

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/capacitacoes` | Autenticado | Lista treinamentos conforme perfil e setor |
| `POST` | `/api/capacitacoes` | Admin | Cria treinamento ou avaliação |
| `PUT` | `/api/capacitacoes/:id` | Admin | Atualiza conteúdo |
| `PATCH` | `/api/capacitacoes/:id/status` | Admin | Ativa ou desativa conteúdo |
| `DELETE` | `/api/capacitacoes/:id` | Admin | Exclui conteúdo |
| `GET` | `/api/capacitacoes/desempenho` | Admin | Consolida resultados |
| `GET` | `/api/capacitacoes/:id/resultados` | Admin | Consulta tentativas |
| `GET` | `/api/capacitacoes/:id/pdf` | Autenticado | Visualiza PDF autorizado |
| `POST` | `/api/capacitacoes/:id/respostas` | Autenticado | Envia respostas da avaliação |

Para anexar PDF, envie `pdf` em `multipart/form-data`.
O limite configurado é de 10 MiB.

### Calendário

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/calendario/setores` | Autenticado | Lista setores visíveis |
| `GET` | `/api/calendario/eventos` | Autenticado | Lista eventos autorizados |
| `POST` | `/api/calendario/eventos` | Autenticado | Cria evento pessoal, de setor ou empresa |
| `DELETE` | `/api/calendario/eventos/:id` | Autenticado | Exclui evento criado pelo usuário |

### Relatórios

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/api/relatorios` | Autenticado | Lista relatórios disponíveis |
| `POST` | `/api/relatorios` | Admin | Gera relatório em JSON ou CSV |

---

## Autenticação no navegador

Durante o login, a API entrega os tokens em cookies `HttpOnly`. O JavaScript
do frontend não deve tentar ler ou armazenar esses valores.

```javascript
const response = await fetch("http://localhost:3333/api/auth/me", {
  credentials: "include",
});

const data = await response.json();
```

No ambiente local mantenha:

```dotenv
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAME_SITE=lax
```

Em produção com HTTPS e frontend em domínio diferente:

```dotenv
AUTH_COOKIE_SECURE=true
AUTH_COOKIE_SAME_SITE=none
CORS_ALLOWED_ORIGINS=https://app.exemplo.com
```

Requisições que alteram dados e usam cookies devem possuir uma origem presente
em `CORS_ALLOWED_ORIGINS`.

Clientes que não usam navegador podem enviar o access token no header:

```bash
curl "http://localhost:3333/api/auth/me" \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

---

## Exemplo de login

### E-mail e senha

```bash
curl -X POST "http://localhost:3333/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "administrador@empresa.com",
    "senha": "SENHA_FORTE"
  }'
```

O mesmo endpoint aceita o campo `login` no lugar de `email`.

### Código do colaborador

```bash
curl -X POST "http://localhost:3333/api/auth/login/codigo" \
  -H "Content-Type: application/json" \
  -d '{
    "codigo_colaborador": "0042"
  }'
```

O código possui exatamente quatro dígitos e inclui zeros à esquerda.

---

## Scripts disponíveis

| Comando | Finalidade |
|---|---|
| `npm run dev` | Servidor em modo watch |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa a versão compilada |
| `npm run typecheck` | Verifica tipos sem gerar arquivos |
| `npm test` | Executa o teste de autenticação |
| `npm run test:learning` | Executa testes do módulo de aprendizagem |
| `npm run test:google-drive` | Testa a integração com Google Drive |
| `npm run authorize:google-drive` | Inicia a autorização OAuth do Google Drive |

---

## Códigos HTTP

| Código | Significado |
|---|---|
| `200` | Requisição concluída com sucesso |
| `201` | Recurso criado |
| `400` | Corpo ou parâmetros inválidos |
| `401` | Sessão ausente, inválida ou expirada |
| `403` | Usuário autenticado sem autorização |
| `404` | Recurso não encontrado |
| `429` | Limite global de requisições excedido |
| `503` | Serviço indisponível ou banco degradado |
| `500` | Erro interno não tratado |

---

## Segurança

- Não versione arquivos `.env`, credenciais ou certificados privados
- Use secrets aleatórios com pelo menos 32 caracteres
- Mantenha `NODE_ENV=production` e HTTPS em produção
- Restrinja `CORS_ALLOWED_ORIGINS` aos domínios reais do frontend
- Habilite `AUTH_COOKIE_SECURE=true` fora de ambientes locais
- Não exponha tokens no corpo das respostas de login
- Preserve os dados sensíveis no servidor e aplique RBAC em todas as operações
- Revogue refresh tokens e faça logout após alterações críticas de senha

---

## Contribuindo

1. Crie uma branch a partir da branch principal
2. Faça alterações pequenas e testáveis
3. Execute `npm run typecheck`
4. Execute os testes relacionados
5. Abra um Pull Request descrevendo a mudança e o impacto
