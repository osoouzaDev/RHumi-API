# RHumi API - Guia de Teste

## 1. Informações gerais

- API: RHumi API
- Porta local: 8000
- Base URL: http://localhost:8000
- Tecnologia: Node.js + TypeScript + Express
- Banco: PostgreSQL

## 2. Como iniciar a aplicação

No terminal do projeto, execute:

```bash
npm install
npm run dev
```

A API ficará disponível em:

```text
http://localhost:8000
```

## 3. Health check

### GET /health

```bash
curl http://localhost:8000/health
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "status": "ok"
  }
}
```

### GET /api/health

```bash
curl http://localhost:8000/api/health
```

## 4. Login

### POST /api/auth/login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "souzaluis.dev@gmail.com",
    "senha": "02132027"
  }'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "token_type": "Bearer",
    "expires_in": 600
  }
}
```

Os tokens são enviados somente em cookies `HttpOnly`; o corpo não expõe
credenciais de sessão. O navegador deve usar `credentials: "include"` nas
requisições à API. O access token expira em até 10 minutos e o refresh token é
rotacionado no servidor.

### Entrar com código do colaborador

O campo `codigo_colaborador` recebe uma string de exatamente quatro dígitos,
incluindo zeros à esquerda quando houver:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "codigo_colaborador": "0042"
  }'
```

O código é gerado automaticamente para cada usuário criado e é incluído na
resposta de `POST /api/usuarios`. Execute a migration
`src/database/migrations/002_codigo_colaborador_usuario.sql` antes de usar o
novo formato de login. Os códigos existentes também são preenchidos pela migration.
O intervalo disponível é de `0000` a `9999`; códigos emitidos não são reutilizados,
inclusive após a exclusão de um usuário.

## Atualizar cadastro de colaborador

O endpoint `PUT /api/usuarios/:id` atualiza parcialmente os dados da conta e do
perfil profissional. Além de nome, e-mail, classificação e status, aceita
`telefone`, `setor`, `cargo`, `tipo_contrato`, `data_admissao` (formato
`AAAA-MM-DD`) e `descricao_cargo`. Para remover um dado opcional, envie `null`.

Antes de permitir perfis sem tipo de contrato informado, execute a migration
`src/database/migrations/003_colaborador_tipo_contrato_opcional.sql`.

## Dados da empresa

Antes de usar os campos de apresentação da empresa, execute a migration
`src/database/migrations/006_dados_publicos_empresa.sql`. Configure
`DEFAULT_EMPRESA_ID` com o UUID da empresa que a API deve gerenciar.

- `GET /api/empresa`: retorna os dados cadastrais, setores, quantidade de colaboradores e classificações da empresa autenticada.
- `PUT /api/empresa`: atualiza os dados cadastrais, a página de carreiras e a cultura organizacional; requer perfil administrador.
- `POST /api/empresa/setores`: adiciona um setor; requer perfil administrador.
- `DELETE /api/empresa/setores/:id`: remove um setor sem colaboradores vinculados; requer perfil administrador.

## Recrutamento

Execute `src/database/migrations/007_recrutamento.sql` em ambientes que ainda
não tenham as tabelas `vaga`, `candidato` e `candidatura`. A migration usa
`CREATE TABLE IF NOT EXISTS` e preserva essas tabelas quando já existem.
Em bancos legados nos quais `candidatura` ainda usa `id_usuario`, execute
também `src/database/migrations/015_recrutamento_candidatos.sql` para criar
`candidato`, migrar os dados e associar cada candidatura ao novo cadastro.

As rotas administrativas usam o `id_empresa` do usuário autenticado, sem aceitar
empresa enviada pelo cliente. Consultas e alterações ficam limitadas à empresa
desse usuário; criação e atualização exigem perfil administrador. A rota pública
usa `DEFAULT_EMPRESA_ID` e retorna somente vagas abertas.

- `GET /api/public/vagas`: lista vagas abertas para o site de carreiras, sem autenticação.
- `GET /api/recrutamento/vagas` e `POST /api/recrutamento/vagas`: consultar e cadastrar vagas.
- `PATCH /api/recrutamento/vagas/:id/status`: pausar ou reabrir uma vaga.
- `GET /api/recrutamento/candidaturas` e `POST /api/recrutamento/candidaturas`: listar candidaturas e associar um candidato a uma vaga aberta.
- `PATCH /api/recrutamento/candidaturas/:id/status`: atualizar a etapa da candidatura.

Os tipos de contrato e etapas aceitos correspondem aos valores definidos nas
restrições das tabelas de recrutamento. O cadastro de candidato grava/atualiza
seus dados em `candidato` e cria a relação com a vaga em `candidatura`.

## Treinamentos e avaliações

Execute `src/database/migrations/009_treinamentos_avaliacoes.sql` depois da
migration inicial e `src/database/migrations/010_prova_treinamento.sql` para
habilitar a prova opcional associada ao treinamento. Execute também
`src/database/migrations/011_exclusao_cascade_resultados.sql` para permitir a
exclusão confirmada de conteúdos com resultados vinculados. A migration 009
preserva os treinamentos existentes e associa os setores já cadastrados.
Configure `DEFAULT_EMPRESA_ID`.

Anexos PDF são limitados a 10 MiB e armazenados fora de uma rota pública. Para
usar o Google Drive, habilite a Drive API no projeto, crie uma conta de serviço,
compartilhe a pasta com o e-mail da conta de serviço e configure
`GOOGLE_DRIVE_TRAINING_FOLDER_ID`. Forneça as credenciais por
`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE` ou
`GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`. PDFs novos serão gravados na pasta do Drive;
PDFs locais anteriores continuam disponíveis como compatibilidade temporária.

Sem a integração do Google Drive, o padrão local é `./storage/training-pdfs`;
configure `TRAINING_PDF_DIR` para apontar para um volume persistente.

- `GET /api/capacitacoes`: lista conteúdos de gerenciamento para administradores; para colaboradores, retorna somente conteúdos ativos destinados ao setor atual e omite as respostas corretas.
- `POST /api/capacitacoes` e `PUT /api/capacitacoes/:id`: criam e editam treinamentos/avaliações; requer perfil administrador. Para PDF anexado, envie o campo `pdf` em `multipart/form-data`.
- `PATCH /api/capacitacoes/:id/status`: ativa ou desativa um conteúdo; requer perfil administrador.
- `DELETE /api/capacitacoes/:id`: exclui o conteúdo e, quando `apagar_resultados: true` for explicitamente confirmado, também remove permanentemente suas tentativas e resultados.
- `GET /api/capacitacoes/:id/pdf`: visualiza o anexo após validar empresa e destino setorial.
- `GET /api/capacitacoes/:id/resultados`: consulta o histórico de tentativas; requer perfil administrador.
- `GET /api/capacitacoes/desempenho`: consolida médias e tentativas de avaliações e provas de treinamento por colaborador ativo; requer perfil administrador.
- `POST /api/capacitacoes/:id/respostas`: recebe a avaliação do colaborador autenticado, corrige no servidor e retorna a quantidade de acertos.

Cada avaliação permite uma tentativa por colaborador. A pontuação é a contagem
de respostas corretas; perguntas, alternativas, respostas e resultados enviados
são preservados em um snapshot histórico quando o conteúdo é editado. A prova
opcional do treinamento usa nota mínima configurável (padrão de 70%); o limiar
e a aprovação ficam registrados junto com cada tentativa.
O desempenho contabiliza avaliações respondidas e provas vinculadas a
treinamentos; a visualização de um treinamento sem prova não gera pontuação
nem registro de conclusão.

## 5. Sessões por cookies HttpOnly

A API define cookies HttpOnly para o access token (validade máxima de 10
minutos) e refresh token. O corpo de login não expõe os tokens. Navegadores
devem enviar as requisições com `credentials: "include"`; o refresh é rotativo,
controlado pelo servidor e o logout revoga imediatamente a sessão.

Execute `src/database/migrations/014_sessoes_autenticacao.sql` para criar os
índices usados na validação das sessões. Em produção, configure
`CORS_ALLOWED_ORIGINS` com as origens exatas do frontend e use HTTPS com
`AUTH_COOKIE_SECURE=true`. Requisições que alteram dados e enviam cookies devem
conter uma origem permitida.

Clientes não-browser ainda podem enviar um access token no header:

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

## 6. Refresh token

### POST /api/auth/refresh

```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "SEU_REFRESH_TOKEN"
  }'
```

Para navegador, envie o cookie HttpOnly em vez de ler o token e inclua a
origem permitida. O endpoint rotaciona os cookies e não devolve os tokens no
corpo.

## 7. Logout

### POST /api/auth/logout

```bash
curl -X POST http://localhost:8000/api/auth/logout \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

## 8. Usuários

### GET /api/usuarios

```bash
curl http://localhost:8000/api/usuarios \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

### GET /api/usuarios/:id

```bash
curl http://localhost:8000/api/usuarios/1 \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

### POST /api/usuarios

```bash
curl -X POST http://localhost:8000/api/usuarios \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "login": "joao.silva",
    "nome": "João Silva",
    "email": "joao@empresa.com",
    "senha": "MinhaSenha123",
    "classificacao": "usuario",
    "ativo": true
  }'
```

### PUT /api/usuarios/:id

```bash
curl -X PUT http://localhost:8000/api/usuarios/1 \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João da Silva",
    "email": "joao.novo@empresa.com",
    "ativo": true
  }'
```

### PATCH /api/usuarios/eu/senha

```bash
curl -X PATCH http://localhost:8000/api/usuarios/eu/senha \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "senha_atual": "senhaAntiga123",
    "nova_senha": "senhaNova456"
  }'
```

## 9. Calendário

Execute `src/database/migrations/013_calendario_compartilhado.sql` para habilitar
eventos compartilhados e seus dados de visibilidade no calendário.

- `GET /api/calendario/eventos` lista somente eventos pessoais do usuário, do
  setor ao qual pertence e da empresa.
- `GET /api/calendario/setores` lista os setores da empresa do usuário.
- `POST /api/calendario/eventos` cria eventos pessoais para colaboradores,
  pessoais ou do próprio setor para supervisores, e pessoais, por setor ou
  para toda a empresa para administradores. O corpo usa `titulo`, `data`
  (`YYYY-MM-DD`), `horario` (`HH:mm`), `categoria` e `escopo`
  (`PESSOAL`, `SETOR` ou `EMPRESA`). Para administradores, eventos de setor
  também exigem `id_setor`.
- `DELETE /api/calendario/eventos/:id` remove apenas eventos criados pelo
  próprio usuário.

## 10. Relatórios

### GET /api/relatorios

```bash
curl http://localhost:8000/api/relatorios \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN"
```

### POST /api/relatorios

```bash
curl -X POST http://localhost:8000/api/relatorios \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "usuarios-ativos",
    "data_inicio": "2026-01-01",
    "data_fim": "2026-12-31",
    "formato": "json"
  }'
```

## 11. Códigos de status esperados

- 200: sucesso
- 201: criação bem-sucedida
- 400: dados inválidos
- 401: token ausente/expirado ou credenciais inválidas
- 403: usuário inativo ou sem permissão
- 404: recurso não encontrado
- 500: erro interno

## 12. Checklist de testes iniciais

1. Iniciar a API na porta 8000
2. Verificar /health
3. Fazer login com usuário admin
4. Consultar /api/auth/me
5. Testar refresh token
6. Listar usuários
7. Criar usuário
8. Alterar senha própria
9. Gerar relatório em JSON
10. Gerar relatório em CSV

## 13. Usuário admin de teste

- email: souzaluis.dev@gmail.com
- senha: 02132027

## 14. Observações

- A autenticação exige JWT no header `Authorization`.
- A API usa a porta 8000 localmente.
- Para testes de apresentação, priorize os endpoints de health, login, me, usuários e relatórios.
