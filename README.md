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

As rotas usam o `id_empresa` do usuário autenticado, sem aceitar empresa enviada
pelo cliente. Consultas e alterações ficam limitadas à empresa desse usuário;
criação e atualização exigem perfil administrador.

- `GET /api/recrutamento/vagas` e `POST /api/recrutamento/vagas`: consultar e cadastrar vagas.
- `PATCH /api/recrutamento/vagas/:id/status`: pausar ou reabrir uma vaga.
- `GET /api/recrutamento/candidaturas` e `POST /api/recrutamento/candidaturas`: listar candidaturas e associar um candidato a uma vaga aberta.
- `PATCH /api/recrutamento/candidaturas/:id/status`: atualizar a etapa da candidatura.

Os tipos de contrato e etapas aceitos correspondem aos valores definidos nas
restrições das tabelas de recrutamento. O cadastro de candidato grava/atualiza
seus dados em `candidato` e cria a relação com a vaga em `candidatura`.

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
