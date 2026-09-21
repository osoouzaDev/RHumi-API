/**
 * Definição de rotas para o sub-domínio "Usuários" (módulo users).
 *
 * Convenção URI: as rotas utilizam o substantivo em língua portuguesa
 * (`/usuarios`) para alinhamento com a linguagem nativa dos stakeholders
 * (equipe RH de língua portuguesa). O código interno dos módulos (dto, service)
 * permanece em inglês para consistência com TypeScript e literatura técnica.
 *
 * Autorização (RBAC) aplicada nas rotas através dos middlewares:
 *
 *   🔓 autenticarToken: Obrigatoriedade em TODAS as rotas do módulo.
 *      Nenhum endpoint de usuário está acessível sem Bearer token válido.
 *
 *   🛡️ authAdmin: Requerido para operações de alteração de outrem (criar,
 *      atualizar dados cadastrais alheios, alterar senha de outrem, deletar).
 *      Equivalente a roles [admin, sakai].
 *
 * Padrão REST adotado (Richardson Maturity Model — Nível 2):
 * ┌────────────────────────────────────────────┬──────────┬────────────┐
 * │ Operação                                   │ Verbo    │ RBAC       │
 * ├────────────────────────────────────────────┼──────────┼────────────┤
 * │ Listar usuários paginados                  │ GET      │ autenticado │
 * │ Consultar usuário por id                   │ GET      │ autenticado │
 * │ Criar novo usuário                         │ POST     │ admin/sakai│
 * │ Atualizar dados cadastrais                 │ PUT      │ admin/sakai│
 * │ Alterar senha de outrem                    │ PATCH    │ admin/sakai│
 * │ Alterar senha própria (/eu/senha)          │ PATCH    │ próprio    │
 * │ Excluir usuário                            │ DELETE   │ sakai      │
 * └────────────────────────────────────────────┴──────────┴────────────┘
 *
 * Observação PUT vs PATCH:
 *   A rota de atualização geral usa PUT, mas o DTO `UpdateUserDTO` permite
 *   campos parciais (todos opcionais). Trata-se de uma conveniência pragmática
 *   — semanticamente PATCH seria mais correto, porém PUT foi mantido por ser
 *   amplamente adotado nas APIs brasileiras de RH. O comportamento real é de
 *   update parcial, nunca sobrescrita completa (inexistente `senha` seria perdida).
 *
 * Ordem de encadeamento de middlewares (por rota):
 *   1. autenticarToken → 2. authAdmin (se for operação admin) →
 *   3. validate (params/body/query) → 4. controller handler.
 */

import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import {
    createUserSchema,
    updateUserSchema,
    updateUserPasswordSchema,
    userIdParamsSchema,
    listUsersQuerySchema,
} from "../modules/users/dto.js";
import { usersController } from "../modules/users/controller.js";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";

/**
 * Instância do Router do Express para rotas de usuários.
 */
export const usersRouter = Router();

/**
 * Rota: GET /api/usuarios — UC "Listar Usuários".
 *
 * Query params (via listUsersQuerySchema): pagina, por_pagina, classificacao, busca.
 * Qualquer usuário autenticado pode consultar a lista (acesso controlado no service
 * no futuro por visibilidade de unidade, hoje global).
 */
usersRouter.get(
    "/api/usuarios",
    autenticarToken,
    validate({ query: listUsersQuerySchema }),
    usersController.listar
);

/**
 * Rota: GET /api/usuarios/:id — UC "Visualizar Usuário por Id".
 *
 * Path param `:id` validado por `userIdParamsSchema` (string não-vazia que
 * representa numérico). Qualquer usuário autenticado pode visualizar perfil
 * alheio (MVP); no futuro, aplicar filtro de authAdmin para detalhes sensíveis.
 */
usersRouter.get(
    "/api/usuarios/:id",
    autenticarToken,
    validate({ params: userIdParamsSchema }),
    usersController.buscarPorId
);

/**
 * Rota: POST /api/usuarios — UC "Cadastrar Usuário".
 *
 * Protegida por `authAdmin` + `autenticarToken`. Body validado por createUserSchema
 * (nome, login, email, senha, classificacao, ativo). Campos de sistema (id,
 * created_at, senha_hash) NÃO são aceitos no corpo — produzidos pelo service.
 */
usersRouter.post(
    "/api/usuarios",
    autenticarToken,
    authAdmin,
    validate({ body: createUserSchema }),
    usersController.criar
);

/**
 * Rota: PUT /api/usuarios/:id — UC "Editar Dados Cadastrais".
 *
 * Admin/Sakai pode editar qualquer usuário. O `UpdateUserDTO` tem todos os
 * campos opcionais (atualização parcial), mas o verbo HTTP PUT foi mantido
 * por convenção de API. A ausência de um campo no body NÃO o limpa no banco;
 * apenas campos presentes são sobrescritos.
 */
usersRouter.put(
    "/api/usuarios/:id",
    autenticarToken,
    authAdmin,
    validate({
        params: userIdParamsSchema,
        body: updateUserSchema,
    }),
    usersController.atualizar
);

/**
 * Rota: PATCH /api/usuarios/:id/senha — UC "Admin Alterar Senha de Usuário".
 *
 * Fluxo diferente do auto-atendimento:
 *   - id do alvo vem da URL (`params.id`).
 *   - Middleware `authAdmin` obriga perfil elevado (admin/sakai).
 *   - Body ainda contém `senha_atual` (mesmo sendo admin, não há backdoor);
 *     para reset real de senha, implementar `POST /usuarios/:id/reset-senha`
 *     com token e-mail em versão futura.
 */
usersRouter.patch(
    "/api/usuarios/:id/senha",
    autenticarToken,
    authAdmin,
    validate({
        params: userIdParamsSchema,
        body: updateUserPasswordSchema,
    }),
    usersController.atualizarSenha
);

/**
 * Rota: PATCH /api/usuarios/eu/senha — UC "Auto-Alterar Senha Própria".
 *
 * NÃO usa `authAdmin`. O id do usuário alvo é EXTRAÍDO do JWT (não da URL),
 * evitando vulnerabilidade IDOR (Insecure Direct Object Reference). Mesmo que
 * o usuário tente adulterar a URL, ela não tem `:id` para injetar.
 */
usersRouter.patch(
    "/api/usuarios/eu/senha",
    autenticarToken,
    validate({ body: updateUserPasswordSchema }),
    usersController.atualizarSenhaPropria
);

/**
 * Rota: DELETE /api/usuarios/:id — UC "Excluir Usuário".
 *
 * Máxima restrição de RBAC: combinando `autenticarToken` + `authAdmin`.
 * Observação: o middleware `authAdmin` hoje aceita admin e sakai; se no
 * futuro for necessário aceitar apenas sakai (superusuário) para exclusões,
 * refinar `authAdmin` para aceitar um parâmetro de roles mínimas
 * (ex.: `authAdmin(["sakai"])`). O próprio service não aplica a regra —
 * responsabilidade do middleware por ISP (separação de concerns).
 */
usersRouter.delete(
    "/api/usuarios/:id",
    autenticarToken,
    authAdmin,
    validate({ params: userIdParamsSchema }),
    usersController.deletar
);

/**
 * Exportação default.
 */
export default usersRouter;
