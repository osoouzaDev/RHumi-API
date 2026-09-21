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
