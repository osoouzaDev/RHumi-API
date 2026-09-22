/**
 * Serviço de domínio de Autenticação.
 *
 * Responsabilidades:
 *   - Criptografia de senha (scrypt + pepper) e comparação em tempo constante
 *     (mitiga timing attacks).
 *   - Emissão de access e refresh tokens via JWT (HS256).
 *   - Orquestração do fluxo de login / refresh / logout com o repositório
 *     de usuários.
 *
 * Segurança:
 *   - Utiliza `crypto.scrypt` (NIST SP 800-132 recomendado para derivação
 *     de chaves) em vez de bcrypt/argon puramente por simplicidade sem
 *     dependências extras.
 *   - `passwordPepper` (variável de ambiente) é concatenado ANTES do salt,
 *     de modo que um vazamento do banco (HASH+SALT) não permita ataque de
 *     dicionário sem também obter o pepper do ambiente.
 *   - `crypto.timingSafeEqual` compara hashes byte a byte em tempo fixo.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import type { TokenPayload } from "../../middlewares/auth.js";
import type { LoginDTO, TokenResponse, RefreshTokenDTO } from "./dto.js";
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
 * Usa `timingSafeEqual` para evitar exploração por timing attack (quando
 * um atacante mede o tempo de resposta para inferir bytes corretos).
 */
function verificarSenha(senhaPlana: string, hashArmazenado: string): boolean {
    try {
        const [salt, key] = hashArmazenado.split(":") as [string, string];
        const derivedKey = scryptSync(senhaPlana + env.passwordPepper, salt, 64);
        return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
    } catch {
        // Formato de hash inválido (corrompido?) → considera senha inválida.
        return false;
    }
}

/**
 * Gera `jti` (JWT ID) — 128 bits hexadecimal, único por token. Usado para
 * identificar instâncias específicas de tokens no mecanismo de blacklist
 * (logout global, troca de senha, etc.).
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
 * Helper interno que orquestra as 3 validações antes de permitir login:
 *   1. Usuário existe por login.
 *   2. Usuário está ativo (não desativado por admin).
 *   3. Senha confere (hash + timing safe).
 *
 * Qualquer falha é genérica em "Credenciais inválidas" (401) para não
 * vazar se o login existe ou não para um atacante enumerativo.
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
 * Fachada exportável. O controller sempre chama métodos deste objeto.
 * Stubs (`logout`, `tokenFoiRevogado`) permanecem até a criação das
 * tabelas de blacklist de tokens no banco.
 */
export const authService = {
    /**
     * Fluxo de login: valida credenciais → emite access + refresh token.
     */
    async autenticar(dto: LoginDTO): Promise<TokenResponse> {
        const loginOuEmail = dto.login ?? dto.email;

        if (!loginOuEmail) {
            throw new AppError("Informe login ou email para autenticar.", 400);
        }

        const usuario = await usuarioExisteEValidoParaLogin(loginOuEmail, dto.senha);

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
            // Refresh token tem seu PRÓPRIO jti para blacklist granular.
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
     * Fluxo de renovação de access token a partir de refresh.
     *
     * Não emite novo refresh (sliding = false), conforme OWASP JWT Cheat
     * Sheet — evita que um refresh token roubado tenha vida eterna via
     * renovações sucessivas. O usuário deverá fazer login completo ao fim
     * do TTL do refresh (padrão 30 dias).
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

        // Recheca existência/ativo do usuário no momento do refresh, para
        // cobrir casos em que ele foi desativado ENTRE o login e o refresh.
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
     * Stub de logout. Atualmente apenas confirma a operação; quando a
     * tabela de blacklist (jti revogado) for criada, o jti será inserido lá.
     */
    async logout(_jti?: string): Promise<{ message: string }> {
        return {
            message: "Logout realizado com sucesso. A persistência de revogação será implementada após a criação das tabelas.",
        };
    },

    /**
     * Stub de checagem de blacklist. Futuramente consultará a tabela de
     * JTIs revogados. Enquanto isso, sempre retorna `false`.
     */
    async tokenFoiRevogado(_jti: string): Promise<boolean> {
        return false;
    },

    // Expõe funções criptográficas para outros módulos (ex: service de usuários
    // precisa de hashSenha() ao criar usuário e verificarSenha() ao trocar senha).
    hashSenha,
    verificarSenha,
};

export default authService;
