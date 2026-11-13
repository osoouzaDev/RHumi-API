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
    "access_token": "...",
    "token_type": "Bearer",
    "expires_in": 1800,
    "refresh_token": "..."
  }
}
```

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

O código é gerado automaticamente para usuários colaboradores e é incluído na
resposta de `POST /api/usuarios`. Contas com perfil `CANDIDATE` não recebem esse
código e entram usando e-mail e senha. Execute as migrations
`src/database/migrations/002_codigo_colaborador_usuario.sql` antes de usar o
novo formato de login e
`src/database/migrations/008_codigo_colaborador_opcional_candidato.sql` para
permitir contas de candidatos sem código. Os códigos existentes também são preenchidos pela migration 002.
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

## Jornadas e recrutamento

Antes de usar as telas de jornada e recrutamento, execute a migration
`src/database/migrations/007_jornadas_recrutamento.sql` no banco configurado
para a API. Ela mantém as tabelas existentes `jornada_tarefa`, `vaga` e
`candidatura`; apenas permite candidaturas sem conta e adiciona os campos de
contato do candidato. Configure também `DEFAULT_EMPRESA_ID` com o UUID da empresa.

- `GET /api/jornadas`: lista os colaboradores ativos e suas etapas de integração; requer autenticação.
- `PATCH /api/jornadas/:usuarioId/etapas/:etapaKey/tarefas/:tarefaKey`: atualiza uma tarefa; requer perfil administrador.
- `DELETE /api/jornadas/:usuarioId/etapas/:etapaKey`: reabre uma etapa; requer perfil administrador.
- `/api/recrutamento/vagas`: lista, cria e atualiza o status das vagas; requer perfil administrador.
- `GET /api/recrutamento/candidaturas` e `PATCH /api/recrutamento/candidaturas/:id/status`: lista candidaturas e atualiza status; requer perfil administrador.
- `GET /api/public/vagas`: lista as vagas abertas da empresa sem exigir autenticação.
- `POST /api/public/candidatos`: cria uma conta de candidato e retorna os tokens de sessão; o perfil `CANDIDATE` é definido pela API.
- `GET /api/candidato/candidaturas` e `POST /api/candidato/candidaturas`: consultam e registram candidaturas para o candidato autenticado.

## 5. Usar token na autenticação

Após receber o `access_token`, envie no header:

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

## 9. Relatórios

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

## 10. Códigos de status esperados

- 200: sucesso
- 201: criação bem-sucedida
- 400: dados inválidos
- 401: token ausente/expirado ou credenciais inválidas
- 403: usuário inativo ou sem permissão
- 404: recurso não encontrado
- 500: erro interno

## 11. Checklist de testes iniciais

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

## 12. Usuário admin de teste

- email: souzaluis.dev@gmail.com
- senha: 02132027

## 13. Observações

- A autenticação exige JWT no header `Authorization`.
- A API usa a porta 8000 localmente.
- Para testes de apresentação, priorize os endpoints de health, login, me, usuários e relatórios.
