/**
 * Barrel file do módulo de autenticação.
 *
 * Centraliza as exportações públicas do módulo `auth`. Qualquer módulo
 * externo (ex.: routes/auth.ts) deve importar deste barrel.
 */

export {
    loginSchema,
    loginCodigoSchema,
    loginEmailSenhaSchema,
    refreshTokenSchema,
} from "./dto.js";

export type {
    LoginDTO,
    LoginEmailSenhaDTO,
    LoginCodigoDTO,
    RefreshTokenDTO,
    TokenResponse,
    LogoutResponse,
} from "./dto.js";

export { authService } from "./service.js";
export { authController } from "./controller.js";
