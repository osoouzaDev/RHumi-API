/**
 * Testes automatizados do sistema de autenticação (RHumi API).
 *
 * Cobertura de testes:
 *  1. Validação de schemas Zod (e-mail+senha, código do colaborador, unificado).
 *  2. Autenticação por e-mail e senha (sucesso, senha inválida, inativo, inexistente).
 *  3. Autenticação por código do colaborador (sucesso, código inválido, inativo, desligado).
 *  4. Emissão, validação e estrutura de tokens JWT (Bearer, claims, exp, jti).
 *  5. Renovação de tokens via Refresh Token (com suporte a usuários e colaboradores).
 *  6. Middleware de autenticação e proteção de rotas (TokenPayload, Bearer, 401/403).
 */

import "dotenv/config";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { loginSchema, loginEmailSenhaSchema, loginCodigoSchema } from "../src/modules/auth/dto.js";
import {
    createUserSchema,
    updateUserSchema,
    resetUserPasswordSchema,
} from "../src/modules/users/dto.js";
import { usuariosService } from "../src/modules/users/service.js";
import { isAdminOrSelf } from "../src/middlewares/authAdmin.js";
import { authService } from "../src/modules/auth/service.js";
import { usuariosRepositorio } from "../src/modules/users/repository.js";
import { env } from "../src/config/env.js";
import { AppError } from "../src/shared/errors/app-error.js";
import {
    candidateApplicationSchema,
    candidateRegistrationSchema,
} from "../src/modules/recruitment/dto.js";

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
    totalTests++;
    try {
        await fn();
        passedTests++;
        console.log(`  ✓ ${name}`);
    } catch (err: unknown) {
        console.error(`  ✗ ${name}`);
        console.error(err);
    }
}

async function main() {
    console.log("\n=======================================================");
    console.log("EXECUTANDO SUÍTE DE TESTES: AUTENTICAÇÃO RHUMI API");
    console.log("=======================================================\n");

    // --------------------------------------------------------------------------
    // 1. Schemas de validação Zod
    // --------------------------------------------------------------------------
    console.log("1. Validação de Schemas (Zod)");

    await runTest("loginEmailSenhaSchema aceita e-mail e senha válidos", () => {
        const payload = { email: "usuario@rhumi.com.br", senha: "senhaValida123" };
        const res = loginEmailSenhaSchema.safeParse(payload);
        assert.equal(res.success, true);
    });

    await runTest("loginEmailSenhaSchema aceita login e senha válidos", () => {
        const payload = { login: "rh_admin", senha: "senhaValida123" };
        const res = loginEmailSenhaSchema.safeParse(payload);
        assert.equal(res.success, true);
    });

    await runTest("loginEmailSenhaSchema rejeita senha curta (< 6 caracteres)", () => {
        const payload = { email: "usuario@rhumi.com.br", senha: "123" };
        const res = loginEmailSenhaSchema.safeParse(payload);
        assert.equal(res.success, false);
    });

    await runTest("loginEmailSenhaSchema rejeita ausência de login e e-mail", () => {
        const payload = { senha: "senhaValida123" };
        const res = loginEmailSenhaSchema.safeParse(payload);
        assert.equal(res.success, false);
    });

    await runTest("loginCodigoSchema aceita código do colaborador válido", () => {
        const payload = { codigo_colaborador: "0042" };
        const res = loginCodigoSchema.safeParse(payload);
        assert.equal(res.success, true);
        if (res.success) {
            assert.equal(res.data.codigo_colaborador, "0042");
        }
    });

    await runTest("loginCodigoSchema rejeita código do colaborador vazio", () => {
        const payload = { codigo_colaborador: "   " };
        const res = loginCodigoSchema.safeParse(payload);
        assert.equal(res.success, false);
    });

    await runTest("loginCodigoSchema rejeita código que não possui quatro dígitos", () => {
        assert.equal(loginCodigoSchema.safeParse({ codigo_colaborador: "42" }).success, false);
        assert.equal(loginCodigoSchema.safeParse({ codigo_colaborador: "12a4" }).success, false);
        assert.equal(loginCodigoSchema.safeParse({ codigo_colaborador: "12345" }).success, false);
    });

    await runTest("loginSchema unificado aceita e-mail e senha", () => {
        const payload = { email: "colaborador@rhumi.com.br", senha: "minhasenha123" };
        const res = loginSchema.safeParse(payload);
        assert.equal(res.success, true);
    });

    await runTest("loginSchema unificado aceita código do colaborador", () => {
        const payload = { codigo_colaborador: "0042" };
        const res = loginSchema.safeParse(payload);
        assert.equal(res.success, true);
    });

    await runTest("loginSchema unificado rejeita payload vazio ou inválido", () => {
        const payload = {};
        const res = loginSchema.safeParse(payload);
        assert.equal(res.success, false);
    });

    await runTest("updateUserSchema valida dados cadastrais do colaborador", () => {
        const result = updateUserSchema.safeParse({
            nome: "Ana Silva",
            email: "ana@example.com",
            classificacao: "EMPLOYEE",
            ativo: true,
            telefone: "11999999999",
            setor: "Tecnologia",
            cargo: "Analista",
            tipo_contrato: "CLT",
            data_admissao: "2026-03-09",
            descricao_cargo: "Responsável por suporte técnico.",
        });
        assert.equal(result.success, true);
    });

    await runTest("updateUserSchema permite limpar dados opcionais do colaborador", () => {
        const result = updateUserSchema.safeParse({
            telefone: null,
            setor: null,
            cargo: null,
            tipo_contrato: null,
            data_admissao: null,
            descricao_cargo: null,
        });
        assert.equal(result.success, true);
    });

    await runTest("updateUserSchema rejeita data de admissão inválida", () => {
        assert.equal(updateUserSchema.safeParse({ data_admissao: "09/03/2026" }).success, false);
    });

    await runTest("createUserSchema aceita dados de acesso e perfil profissional", () => {
        const result = createUserSchema.safeParse({
            login: "ana@example.com",
            nome: "Ana Silva",
            email: "ana@example.com",
            senha: "secure-password",
            classificacao: "EMPLOYEE",
            ativo: true,
            telefone: "11999999999",
            setor: "Tecnologia",
            cargo: "Analista",
            tipo_contrato: "CLT",
            data_admissao: "2026-03-09",
            descricao_cargo: "Responsável por suporte técnico.",
        });
        assert.equal(result.success, true);
    });

    await runTest("candidateRegistrationSchema valida cadastro público de candidato", () => {
        const result = candidateRegistrationSchema.safeParse({
            nome: "Ana Silva",
            email: "ana@example.com",
            telefone: null,
            senha: "senha-segura-123",
        });
        assert.equal(result.success, true);
    });

    await runTest("candidateRegistrationSchema rejeita campos internos de perfil ou código", () => {
        const result = candidateRegistrationSchema.safeParse({
            nome: "Ana Silva",
            email: "ana@example.com",
            telefone: null,
            senha: "senha-segura-123",
            classificacao: "admin",
        });
        assert.equal(result.success, false);
        assert.equal(candidateRegistrationSchema.safeParse({
            nome: "Ana Silva",
            email: "ana@example.com",
            telefone: null,
            senha: "senha-segura-123",
            codigo_colaborador: "0042",
        }).success, false);
    });

    await runTest("candidateApplicationSchema aceita identificador de vaga UUID", () => {
        assert.equal(
            candidateApplicationSchema.safeParse({
                id_vaga: "67e55044-10b1-426f-9247-bb680e5fe0c8",
            }).success,
            true,
        );
        assert.equal(candidateApplicationSchema.safeParse({ id_vaga: "1" }).success, false);
    });

    await runTest("resetUserPasswordSchema exige senha com pelo menos 8 caracteres", () => {
        assert.equal(resetUserPasswordSchema.safeParse({ nova_senha: "nova-senha-segura" }).success, true);
        assert.equal(resetUserPasswordSchema.safeParse({ nova_senha: "curta" }).success, false);
        assert.equal(resetUserPasswordSchema.safeParse({}).success, false);
    });

    await runTest("Autorização de edição permite usuário editar o próprio cadastro", () => {
        assert.equal(isAdminOrSelf("EMPLOYEE", "user-1", "user-1"), true);
        assert.equal(isAdminOrSelf("sakai", "admin-1", "user-1"), true);
        assert.equal(isAdminOrSelf("EMPLOYEE", "user-1", "user-2"), false);
    });

    // --------------------------------------------------------------------------
    // 2. Autenticação por E-mail e Senha
    // --------------------------------------------------------------------------
    console.log("\n2. Autenticação por E-mail e Senha");

    const mockSenhaValida = "senhaSegura123";
    const mockSenhaHash = authService.hashSenha(mockSenhaValida);

    const mockUsuarioAtivo = {
        id: "usr-uuid-001",
        login: "souzaluis.dev@gmail.com",
        nome: "Luís Guilherme de Souza Ribeiro",
        email: "souzaluis.dev@gmail.com",
        classificacao: "HR_ADMIN" as const,
        ativo: true,
        data_criacao: new Date().toISOString(),
        data_atualizacao: new Date().toISOString(),
        senha_hash: mockSenhaHash,
    };

    const mockUsuarioInativo = {
        ...mockUsuarioAtivo,
        id: "usr-uuid-002",
        email: "inativo@rhumi.com.br",
        ativo: false,
    };

    const originalBuscarPorLogin = usuariosRepositorio.buscarPorLogin;
    const originalBuscarPorCodigo = usuariosRepositorio.buscarPorCodigoColaborador;
    const originalBuscarPorId = usuariosRepositorio.buscarPorId;
    const originalBuscarPorEmail = usuariosRepositorio.buscarPorEmail;
    const originalAtualizarSenha = usuariosRepositorio.atualizarSenha;

    await runTest("Autentica com e-mail e senha válidos e retorna tokens", async () => {
        usuariosRepositorio.buscarPorLogin = async (login: string) => {
            if (login === mockUsuarioAtivo.email) return mockUsuarioAtivo;
            return null;
        };

        const res = await authService.autenticar({
            email: mockUsuarioAtivo.email,
            senha: mockSenhaValida,
        });

        assert.ok(res.access_token, "access_token deve existir");
        assert.ok(res.refresh_token, "refresh_token deve existir");
        assert.equal(res.token_type, "Bearer");
        assert.equal(typeof res.expires_in, "number");

        const decoded = jwt.verify(res.access_token, env.jwtSecret) as any;
        assert.equal(decoded.id, mockUsuarioAtivo.id);
        assert.equal(decoded.userLogin, mockUsuarioAtivo.login);
        assert.equal(decoded.classificacao, mockUsuarioAtivo.classificacao);
        assert.ok(decoded.jti);
    });

    await runTest("Rejeita autenticação com senha incorreta (401)", async () => {
        usuariosRepositorio.buscarPorLogin = async () => mockUsuarioAtivo;

        await assert.rejects(
            async () => {
                await authService.autenticar({
                    email: mockUsuarioAtivo.email,
                    senha: "senhaIncorretaErrada",
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 401);
                assert.equal(err.message, "Credenciais inválidas.");
                return true;
            }
        );
    });

    await runTest("Rejeita autenticação para usuário inexistente (401)", async () => {
        usuariosRepositorio.buscarPorLogin = async () => null;

        await assert.rejects(
            async () => {
                await authService.autenticar({
                    email: "inexistente@rhumi.com.br",
                    senha: "qualquersenha123",
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 401);
                assert.equal(err.message, "Credenciais inválidas.");
                return true;
            }
        );
    });

    await runTest("Rejeita autenticação para usuário inativo (403)", async () => {
        usuariosRepositorio.buscarPorLogin = async () => mockUsuarioInativo;

        await assert.rejects(
            async () => {
                await authService.autenticar({
                    email: mockUsuarioInativo.email,
                    senha: mockSenhaValida,
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 403);
                assert.equal(err.message, "Usuário inativo. Contate o administrador.");
                return true;
            }
        );
    });

    // --------------------------------------------------------------------------
    // 3. Autenticação por Código do Colaborador
    // --------------------------------------------------------------------------
    console.log("\n3. Autenticação por Código do Colaborador");

    const mockUsuarioCodigoAtivo = {
        ...mockUsuarioAtivo,
        id: "usr-uuid-colab-101",
        login: "kaua.dev09@gmail.com",
        nome: "Kauã Luiz dos Santos",
        email: "kaua.dev09@gmail.com",
        classificacao: "EMPLOYEE" as const,
    };

    await runTest("Autentica com código de colaborador ativo e retorna tokens", async () => {
        usuariosRepositorio.buscarPorCodigoColaborador = async (codigo: string) => {
            if (codigo === "0042") return mockUsuarioCodigoAtivo;
            return null;
        };

        const res = await authService.autenticar({
            codigo_colaborador: "0042",
        });

        assert.ok(res.access_token, "access_token deve existir");
        assert.ok(res.refresh_token, "refresh_token deve existir");
        assert.equal(res.token_type, "Bearer");

        const decoded = jwt.verify(res.access_token, env.jwtSecret) as any;
        assert.equal(decoded.id, mockUsuarioCodigoAtivo.id);
        assert.equal(decoded.userLogin, mockUsuarioCodigoAtivo.login);
        assert.equal(decoded.classificacao, "EMPLOYEE");
        assert.ok(decoded.jti);
    });

    await runTest("Rejeita autenticação com código de colaborador inexistente (401)", async () => {
        usuariosRepositorio.buscarPorCodigoColaborador = async () => null;

        await assert.rejects(
            async () => {
                await authService.autenticar({
                    codigo_colaborador: "9999",
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 401);
                assert.equal(err.message, "Credenciais inválidas.");
                return true;
            }
        );
    });

    await runTest("Rejeita autenticação com código de usuário inativo (403)", async () => {
        usuariosRepositorio.buscarPorCodigoColaborador = async () => ({
            ...mockUsuarioCodigoAtivo,
            ativo: false,
        });

        await assert.rejects(
            async () => {
                await authService.autenticar({
                    codigo_colaborador: "0042",
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 403);
                assert.equal(err.message, "Usuário inativo. Contate o administrador.");
                return true;
            }
        );
    });

    // --------------------------------------------------------------------------
    // 4. Renovação de Tokens (Refresh Token)
    // --------------------------------------------------------------------------
    console.log("\n4. Renovação de Tokens (Refresh Token)");

    await runTest("Renova access token válido para usuário autenticado por código", async () => {
        usuariosRepositorio.buscarPorCodigoColaborador = async () => mockUsuarioCodigoAtivo;
        usuariosRepositorio.buscarPorId = async () => mockUsuarioCodigoAtivo;

        const authRes = await authService.autenticarPorCodigo({
            codigo_colaborador: "0042",
        });

        const refreshRes = await authService.renovarToken({
            refresh_token: authRes.refresh_token,
        });

        assert.ok(refreshRes.access_token);
        assert.equal(refreshRes.token_type, "Bearer");

        const decoded = jwt.verify(refreshRes.access_token, env.jwtSecret) as any;
        assert.equal(decoded.id, mockUsuarioCodigoAtivo.id);
        assert.equal(decoded.classificacao, "EMPLOYEE");
    });

    await runTest("Rejeita refresh token inválido ou corrompido (401)", async () => {
        await assert.rejects(
            async () => {
                await authService.renovarToken({
                    refresh_token: "token.invalido.corrompido",
                });
            },
            (err: any) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 401);
                return true;
            }
        );
    });

    console.log("\n5. Atualização de dados cadastrais");
    const originalUpdate = usuariosRepositorio.atualizar;
    const updateUser = {
        id: "user-to-update",
        login: "ana@example.com",
        nome: "Ana Silva",
        email: "ana@example.com",
        classificacao: "EMPLOYEE" as const,
        ativo: true,
        data_criacao: "2026-01-01T00:00:00.000Z",
        data_atualizacao: "2026-01-01T00:00:00.000Z",
    };

    await runTest("Atualiza cadastro completo do colaborador", async () => {
        usuariosRepositorio.buscarPorId = async () => updateUser;
        usuariosRepositorio.buscarPorEmail = async () => null;
        usuariosRepositorio.atualizar = async (_id, dto) => ({ ...updateUser, ...dto });

        const result = await usuariosService.atualizar("user-to-update", {
            nome: "Ana Silva",
            email: "ana@example.com",
            classificacao: "EMPLOYEE",
            ativo: true,
            telefone: "11999999999",
            setor: "Tecnologia",
            cargo: "Analista",
            tipo_contrato: "CLT",
            data_admissao: "2026-03-09",
            descricao_cargo: "Responsável por suporte técnico.",
        });

        assert.equal(result.cargo, "Analista");
        assert.equal(result.setor, "Tecnologia");
        assert.equal(result.tipo_contrato, "CLT");
        assert.equal(result.data_admissao, "2026-03-09");
    });

    await runTest("Impede atualização para e-mail já utilizado por outro usuário", async () => {
        usuariosRepositorio.buscarPorId = async () => updateUser;
        usuariosRepositorio.buscarPorEmail = async () => ({ ...updateUser, id: "other-user" });
        let repositoryUpdated = false;
        usuariosRepositorio.atualizar = async (_id, dto) => {
            repositoryUpdated = true;
            return { ...updateUser, ...dto };
        };

        await assert.rejects(
            () => usuariosService.atualizar("user-to-update", { email: "used@example.com" }),
            (error: unknown) => error instanceof AppError && error.statusCode === 409
        );
        assert.equal(repositoryUpdated, false);
    });

    await runTest("Redefine senha administrativa usando hash e sem exigir senha atual", async () => {
        usuariosRepositorio.buscarPorId = async () => updateUser;
        let savedHash = "";
        usuariosRepositorio.atualizarSenha = async (_id, hash) => {
            savedHash = hash;
        };

        await usuariosService.resetarSenha("user-to-update", "nova-senha-segura");

        assert.notEqual(savedHash, "nova-senha-segura");
        assert.equal(authService.verificarSenha("nova-senha-segura", savedHash), true);
    });

    await runTest("Não redefine senha para usuário inexistente", async () => {
        usuariosRepositorio.buscarPorId = async () => null;
        let passwordUpdated = false;
        usuariosRepositorio.atualizarSenha = async () => {
            passwordUpdated = true;
        };

        await assert.rejects(
            () => usuariosService.resetarSenha("missing-user", "nova-senha-segura"),
            (error: unknown) => error instanceof AppError && error.statusCode === 404
        );
        assert.equal(passwordUpdated, false);
    });

    // Restaura os repositórios originais
    usuariosRepositorio.buscarPorLogin = originalBuscarPorLogin;
    usuariosRepositorio.buscarPorCodigoColaborador = originalBuscarPorCodigo;
    usuariosRepositorio.buscarPorId = originalBuscarPorId;
    usuariosRepositorio.buscarPorEmail = originalBuscarPorEmail;
    usuariosRepositorio.atualizar = originalUpdate;
    usuariosRepositorio.atualizarSenha = originalAtualizarSenha;

    console.log("\n=======================================================");
    console.log(`RESULTADO: ${passedTests}/${totalTests} testes passaram.`);
    console.log("=======================================================\n");

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

main().catch((e) => {
    console.error("Falha fatal na execução dos testes:", e);
    process.exit(1);
});
