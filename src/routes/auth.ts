/**
 * Definição de rotas do recurso "Autenticação e Sessão" (módulo auth).
 *
 * Casos de uso mapeados (Diagrama de Casos de Uso — RHumi Auth):
 *
 *   UC1. Autenticar Usuário (Login)     → POST /api/auth/login
 *   UC2. Renovar Acess Token (Refresh)  → POST /api/auth/refresh
 *   UC3. Encerrar Sessão (Logout)       → POST /api/auth/logout
 *   UC4. Consultar Dados Autodescritivos → GET  /api/auth/me
 *
 * Ordem de encadeamento dos middlewares em cada rota (convenção adotada no RHumi):
 *
 *   [1] validate({ ... })   → Zod schema check. Sempre ANTES de auth para rejeitar
 *                             cedo requests sintaticamente ruins, mesmo sem token.
 *   [2] autenticarToken     → Middleware de autenticação JWT. Apenas em rotas
 *                             que requerem sessão ativa (logout e me).
 *   [3] authAdmin           → (Não usado aqui). Rotas auth são públicas ou do
 *                             próprio usuário autenticado.
 *   [4] Controller handler  → Execução do caso de uso.
 *
 * Observações de segurança (OWASP Cheat Sheet: Authentication):
 *
 *   • Login e Refresh aceitam tanto body quanto cookies: o controller usa
 *     helper `extrairCookies(req)` (parser manual, sem cookie-parser) para
 *     aceitar refresh_token via Cookie Header quando `AUTH_COOKIES_ENABLED=true`.
 *   • Rate limiting: `globalLimiter` já está aplicado no app.ts ANTES de
 *     todos os routers. Para endpoints de autenticação, recomenda-se no
 *     futuro um rate limiter DEDICADO mais agressivo (ex.: 5 req/min por IP
 *     para /login — mitiga brute force).
 */

import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { loginSchema, refreshTokenSchema } from "../modules/auth/dto.js";
import { authController } from "../modules/auth/controller.js";
import { autenticarToken } from "../middlewares/auth.js";

/**
 * Instância do Router do Express para o sub-domínio de autenticação.
 */
export const authRouter = Router();

/**
 * Rota: POST /api/auth/login — UC "Autenticar Usuário".
 *
 * Cadeia de responsabilidades:
 *   1. `validate({ body: loginSchema })`: certifica que `login` (3-50 chars)
 *      e `senha` (8+ chars) existem no corpo; falha 400 se não.
 *   2. `authController.login()`: busca por login, compara hash via
 *      `timingSafeEqual`, emite access_token (JWT curto) + refresh_token
 *      (JWT longo e jti para blacklist futura).
 *
 * Segurança: rota pública (NÃO requer token), mas sensível.
 */
authRouter.post(
    "/api/auth/login",
    validate({ body: loginSchema }),
    authController.login
);

/**
 * Rota: POST /api/auth/refresh — UC "Renovar Access Token".
 *
 * Propósito: evitar reenvio de senha a cada 15 min (duração típica do access_token).
 * O refresh_token tem validade maior (ex.: 7 dias) e pode ser rotacionado.
 *
 * Cadeia: validate (corpo refresh) → controller.refresh.
 * Não usa `autenticarToken` pois o refresh_token substitui a sessão durante
 * a renovação — middleware de autenticação valida access_token, que já expirou.
 */
authRouter.post(
    "/api/auth/refresh",
    validate({ body: refreshTokenSchema }),
    authController.refresh
);

/**
 * Rota: POST /api/auth/logout — UC "Encerrar Sessão".
 *
 * Cadeia:
 *   1. `autenticarToken`: só sessão ativa pode se deslogar (invalida jti da sessão).
 *   2. `authController.logout()`: marca jti do refresh token associado como
 *      revogado em `banco.tokenRevogado()` (quando tabela existir).
 *
 * Observação: logout sem banco de dados real (hoje stub) apenas responde 204
 * sem efeito colateral. Quando a tabela for criada, é operação de escrita.
 */
authRouter.post(
    "/api/auth/logout",
    autenticarToken,
    authController.logout
);

/**
 * Rota: GET /api/auth/me — UC "Consultar Meu Perfil Autenticado".
 *
 * Usado pelo frontend logo após o login para montar o dashboard (nome,
 * classificação RBAC para exibir/ocultar telas administrativas).
 *
 * Cadeia: autenticarToken (popula req.user) → authController.eu() retorna
 * os campos públicos do usuário (SEM senha_hash, SEM dados sensíveis).
 */
authRouter.get(
    "/api/auth/me",
    autenticarToken,
    authController.eu
);

/**
 * Exportação default para montagem em app.ts.
 */
export default authRouter;
