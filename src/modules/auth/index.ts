/**
 * Barrel file do módulo de autenticação.
 *
 * Centraliza as exportações públicas do módulo `auth`. Qualquer módulo
 * externo (ex.: routes/auth.ts) deve importar deste barrel e nunca dos
 * arquivos internos (`./dto.js`, `./service.js`, etc.) diretamente —
 * a menos que haja uma dependência interna específica.
 *
 * Vantagem: se a estrutura interna mudar (arquivos renomeados, split de
 * service em múltiplas classes), apenas este arquivo precisa ser ajustado.
 */

export { loginSchema, refreshTokenSchema } from "./dto.js";
export type { LoginDTO, RefreshTokenDTO, TokenResponse, LogoutResponse } from "./dto.js";
