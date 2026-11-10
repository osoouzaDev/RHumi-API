/**
 * Serviço de domínio de Autenticação.
 *
 * Responsabilidades:
 *   - Criptografia de senha (scrypt + pepper) e comparação em tempo constante
 *     (mitiga timing attacks).
 *   - Emissão de access e refresh tokens via JWT (HS256).
 *   - Orquestração do fluxo de login / refresh / logout com o repositório de usuários.
 *   - Suporte a dois fluxos de autenticação:
 *       1. E-mail e senha: login com credenciais tradicionais cadastradas.
 *       2. Código do colaborador: login com código único do colaborador cadastrado.
 *
 * Segurança:
 *   - Utiliza `crypto.scrypt` (NIST SP 800-132 recomendado para derivação
 *     de chaves).
 *   - `passwordPepper` (variável de ambiente) é concatenado ANTES do salt.
 *   - `crypto.timingSafeEqual` compara hashes byte a byte em tempo fixo.
 *   - Validação do status do usuário antes de emitir tokens.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { TokenPayload } from "../../middlewares/auth.js";
import type { LoginDTO, LoginEmailSenhaDTO, LoginCodigoDTO, TokenResponse, RefreshTokenDTO } from "./dto.js";
import { usuariosRepositorio } from "../users/repository.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Gera o hash de uma senha plana para persistência no banco.
 * Formato de saída: `<salt_hex>:<derived_key_hex>` (64 bytes = 512 bits).
 */
function hashSenha(senhaPlana: string): string {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = scryptSync(senhaPlana + env.passwordPepper, salt, 64);
    return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verifica se a senha plana confere com o hash armazenado.
 * Usa `timingSafeEqual` para evitar exploração por timing attack.
 */
function verificarSenha(senhaPlana: string, hashArmazenado: string): boolean {
    try {
        const [salt, key] = hashArmazenado.split(":") as [string, string];
        const derivedKey = scryptSync(senhaPlana + env.passwordPepper, salt, 64);
        return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
    } catch {
        return false;
    }
}

/**
 * Gera `jti` (JWT ID) — 128 bits hexadecimal, único por token. Usado para
 * identificar instâncias específicas de tokens no mecanismo de blacklist.
 */
function gerarJti(): string {
    return randomBytes(16).toString("hex");
}

/**
 * Assina o ACCESS token JWT com os claims padrão.
 * `expiresIn` = `env.accessTokenCookieMaxAgeSec` (padrão 30 min).
 */
function assinarTokenAcesso(payload: TokenPayload): string {
    const { exp: _ignoredExp, ...jwtPayload } = payload;
    return jwt.sign(jwtPayload, env.jwtSecret, {
        algorithm: "HS256",
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
        expiresIn: env.accessTokenCookieMaxAgeSec,
    });
}

/**
 * Assina o REFRESH token JWT (TTL mais longo, padrão 30 dias).
 * Usado exclusivamente no endpoint `/auth/refresh` para renovar o
 * access token sem exigir login/senha novamente.
 */
function assinarTokenRefresh(payload: TokenPayload): string {
    const { exp: _ignoredExp, ...jwtPayload } = payload;
    return jwt.sign(jwtPayload, env.jwtSecret, {
        algorithm: "HS256",
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
        expiresIn: env.refreshTokenCookieMaxAgeSec,
    });
}

/**
 * Validação do fluxo 1 (E-mail e senha):
 *   1. Usuário existe por login/email.
 *   2. Usuário está ativo (não desativado por admin).
 *   3. Senha confere (hash + timing safe).
 *
 * Qualquer falha é genérica em "Credenciais inválidas." (401) para mitigar enumeração.
 */
async function usuarioExisteEValidoParaLogin(
    loginOuEmail: string,
    senha: string
): Promise<NonNullable<Awaited<ReturnType<typeof usuariosRepositorio["buscarPorLogin"]>>>> {
    const usuario = await usuariosRepositorio.buscarPorLogin(loginOuEmail);
    if (!usuario) {
        throw new AppError("Credenciais inválidas.", 401);
    }
    if (!usuario.ativo) {
        throw new AppError("Usuário inativo. Contate o administrador.", 403);
    }
    const senhaValida = verificarSenha(senha, usuario.senha_hash);
    if (!senhaValida) {
        throw new AppError("Credenciais inválidas.", 401);
    }
    return usuario;
}

/**
 * Fachada exportável do serviço de autenticação.
 */
export const authService = {
    /**
     * Fluxo principal de login: detecta se a credencial fornecida é
     * por código do colaborador ou e-mail/login + senha, valida e emite tokens.
     */
    async autenticar(dto: LoginDTO | LoginEmailSenhaDTO | LoginCodigoDTO): Promise<TokenResponse> {
        // Fluxo 2: Código do colaborador
        if ("codigo_colaborador" in dto && dto.codigo_colaborador) {
            return await authService.autenticarPorCodigo({
                codigo_colaborador: dto.codigo_colaborador,
            });
        }

        // Fluxo 1: E-mail e senha
        if ("senha" in dto && dto.senha) {
            const loginOuEmail = dto.email ?? dto.login;
            if (!loginOuEmail) {
                throw new AppError("Informe e-mail ou login para autenticar.", 400);
            }
            return await authService.autenticarPorEmail(loginOuEmail, dto.senha);
        }

        throw new AppError("Informe e-mail e senha ou código do colaborador para autenticar.", 400);
    },

    /**
     * Autenticação específica por e-mail e senha.
     */
    async autenticarPorEmail(loginOuEmail: string, senha: string): Promise<TokenResponse> {
        const usuario = await usuarioExisteEValidoParaLogin(loginOuEmail, senha);

        const basePayload: Omit<TokenPayload, "exp"> = {
            id: usuario.id,
            userLogin: usuario.login,
            classificacao: usuario.classificacao,
            jti: gerarJti(),
        };

        const accessPayload: Omit<TokenPayload, "exp"> = {
            ...basePayload,
        };
        const refreshPayload: Omit<TokenPayload, "exp"> = {
            ...basePayload,
            jti: gerarJti(),
        };

        return {
            access_token: assinarTokenAcesso(accessPayload),
            token_type: "Bearer",
            expires_in: env.accessTokenCookieMaxAgeSec,
            refresh_token: assinarTokenRefresh(refreshPayload),
        };
    },

    /**
     * Autenticação específica por código único do colaborador.
     */
    async autenticarPorCodigo(dto: LoginCodigoDTO): Promise<TokenResponse> {
        const codigo = dto.codigo_colaborador?.trim();
        if (!codigo || !/^\d{4}$/.test(codigo)) {
            throw new AppError("O código do colaborador deve ter exatamente 4 dígitos.", 400);
        }

        const usuario = await usuariosRepositorio.buscarPorCodigoColaborador(codigo);
        if (!usuario) {
            throw new AppError("Credenciais inválidas.", 401);
        }
        if (!usuario.ativo) {
            throw new AppError("Usuário inativo. Contate o administrador.", 403);
        }

        const basePayload: Omit<TokenPayload, "exp"> = {
            id: usuario.id,
            userLogin: usuario.login,
            classificacao: usuario.classificacao,
            jti: gerarJti(),
        };

        const accessPayload: Omit<TokenPayload, "exp"> = {
            ...basePayload,
        };
        const refreshPayload: Omit<TokenPayload, "exp"> = {
            ...basePayload,
            jti: gerarJti(),
        };

        return {
            access_token: assinarTokenAcesso(accessPayload),
            token_type: "Bearer",
            expires_in: env.accessTokenCookieMaxAgeSec,
            refresh_token: assinarTokenRefresh(refreshPayload),
        };
    },

    /**
     * Fluxo de renovação de access token a partir de refresh token.
     */
    async renovarToken(dto: RefreshTokenDTO): Promise<TokenResponse> {
        const token = dto.refresh_token;
        if (!token) {
            throw new AppError("Refresh token não informado.", 400);
        }
        let decoded: TokenPayload;
        try {
            decoded = jwt.verify(token, env.jwtSecret, {
                algorithms: ["HS256"],
                issuer: env.jwtIssuer,
                audience: env.jwtAudience,
            }) as TokenPayload;
        } catch {
            throw new AppError("Refresh token inválido ou expirado.", 401);
        }

        const revogado = await authService.tokenFoiRevogado(decoded.jti);
        if (revogado) {
            throw new AppError("Refresh token revogado.", 401);
        }

        // Recheca existência e status do usuário no momento do refresh.
        const usuario = await usuariosRepositorio.buscarPorId(decoded.id);
        if (!usuario || !usuario.ativo) {
            throw new AppError("Usuário não encontrado ou inativo.", 403);
        }

        const novoJti = gerarJti();
        const accessPayload: Omit<TokenPayload, "exp"> = {
            id: usuario.id,
            userLogin: usuario.login,
            classificacao: usuario.classificacao,
            jti: novoJti,
        };

        return {
            access_token: assinarTokenAcesso(accessPayload),
            token_type: "Bearer",
            expires_in: env.accessTokenCookieMaxAgeSec,
        };
    },

    /**
     * Stub de logout.
     */
    async logout(_jti?: string): Promise<{ message: string }> {
        return {
            message: "Logout realizado com sucesso.",
        };
    },

    /**
     * Stub de checagem de blacklist.
     */
    async tokenFoiRevogado(_jti: string): Promise<boolean> {
        return false;
    },

    hashSenha,
    verificarSenha,
};

export default authService;
