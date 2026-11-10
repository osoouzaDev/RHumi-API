/**
 * Definição de rotas do recurso "Autenticação e Sessão" (módulo auth).
 *
 * Casos de uso mapeados:
 *   UC1. Autenticar Usuário (Login E-mail/Senha ou Código) → POST /api/auth/login
 *   UC2. Autenticar Colaborador por Código                 → POST /api/auth/login/codigo
 *   UC3. Renovar Access Token (Refresh)                   → POST /api/auth/refresh
 *   UC4. Encerrar Sessão (Logout)                         → POST /api/auth/logout
 *   UC5. Consultar Dados Autodescritivos                  → GET  /api/auth/me
 */

import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { loginSchema, loginCodigoSchema, refreshTokenSchema } from "../modules/auth/dto.js";
import { authController } from "../modules/auth/controller.js";
import { autenticarToken } from "../middlewares/auth.js";

/**
 * Instância do Router do Express para o sub-domínio de autenticação.
 */
export const authRouter = Router();

/**
 * Rota: POST /api/auth/login — UC "Autenticar Usuário".
 * Aceita autenticação por:
 *  - E-mail e senha ({ email, senha } ou { login, senha })
 *  - Código do colaborador ({ codigo_colaborador })
 */
authRouter.post(
    "/api/auth/login",
    validate({ body: loginSchema }),
    authController.login
);

/**
 * Rota: POST /api/auth/login/codigo — UC "Autenticar Colaborador por Código".
 * Endpoint dedicado para autenticação direta utilizando o código único do colaborador.
 */
authRouter.post(
    "/api/auth/login/codigo",
    validate({ body: loginCodigoSchema }),
    authController.loginCodigo
);

/**
 * Rota: POST /api/auth/refresh — UC "Renovar Access Token".
 */
authRouter.post(
    "/api/auth/refresh",
    validate({ body: refreshTokenSchema }),
    authController.refresh
);

/**
 * Rota: POST /api/auth/logout — UC "Encerrar Sessão".
 */
authRouter.post(
    "/api/auth/logout",
    autenticarToken,
    authController.logout
);

/**
 * Rota: GET /api/auth/me — UC "Consultar Meu Perfil Autenticado".
 */
authRouter.get(
    "/api/auth/me",
    autenticarToken,
    authController.eu
);

export default authRouter;
