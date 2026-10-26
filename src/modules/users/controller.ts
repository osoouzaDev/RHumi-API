/**
 * Camada de Aplicação (Application Layer) / Controller para o recurso Usuário.
 *
 * Este módulo implementa os handlers HTTP do padrão MVC adaptado para APIs
 * REST (Web API Controllers). Responsabilidade única: orquestrar o fluxo
 * request → validação de entrada → invocação do serviço → montagem da resposta.
 *
 * Distinção fundamental em relação à Service Layer:
 * - Controllers conhecem Express (Request / Response / NextFunction).
 * - Controllers NÃO contêm regras de negócio; estas são delegadas para
 *   `usuariosService`. Controllers só traduzem o protocolo HTTP em chamadas
 *   tipadas de domínio e traduzem de volta os resultados em envelopes JSON.
 *
 * Padrão de tratamento de erro adotado:
 *   Cada handler encapsula sua lógica em bloco `try/catch` e reencaminha
 *   qualquer exceção capturada para o error handler global (`errorHandler`)
 *   via `next(error)`. Isso centraliza a formatação de respostas de erro e
 *   evita que o Express despeje HTML de erro 500 padrão em APIs JSON.
 *
 * Assinatura de cada handler respeita o contrato `(req, res, next): Promise<void>`
 * compatível com Express v5, garantindo que rejeições de Promessas não fiquem
 * "flutuando" (UnhandledPromiseRejection) graças ao bloco try/catch.
 */

import type { Request, Response, NextFunction } from "express";
import { usuariosService } from "./service.js";
import { success, created, noContent } from "../../shared/http/success.js";
import { validatedBody, validatedParams, validatedQuery } from "../../middlewares/validate.js";
import type {
    CreateUserDTO,
    UpdateUserDTO,
    UpdateUserPasswordDTO,
    ListUsersQuery,
    UserIdParams,
    Usuario,
    UsuarioCriado,
    PaginatedResponse,
    ResetUserPasswordDTO,
} from "./dto.js";
import type { AuthRequest } from "../../middlewares/auth.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Fachada de controllers do recurso `/users`.
 *
 * Mapeamento convencional REST:
 * ┌────────────────────────┬──────────────────────────┬────────────────────────┐
 * │ Método HTTP + Rota     │ Handler                  │ Descrição              │
 * ├────────────────────────┼──────────────────────────┼────────────────────────┤
 * │ GET    /users          │ listar                   │ Listar c/ paginação    │
 * │ GET    /users/:id      │ buscarPorId              │ Consulta individual    │
 * │ POST   /users          │ criar                    │ Cadastrar novo         │
 * │ PATCH  /users/:id      │ atualizar                │ Editar dados           │
 * │ PATCH  /users/me/password │ atualizarSenhaPropria │ Auto-alterar senha     │
 * │ PATCH  /users/:id/password │ atualizarSenha     │ Admin altera senha     │
 * │ PATCH  /users/:id/reset-password │ resetarSenha  │ Admin redefine senha   │
 * │ DELETE /users/:id      │ deletar                  │ Remover usuário        │
 * └────────────────────────┴──────────────────────────┴────────────────────────┘
 * (O mapeamento rota → handler é feito em `src/routes/users.ts`.)
 */
export const usersController = {
    async listarSetores(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const requester = (req as AuthRequest).user;
            if (!requester?.id) {
                throw new AppError("Usuário não autenticado.", 401);
            }
            const setores = await usuariosService.listarSetoresPorUsuario(requester.id);
            success<string[]>(res, setores, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: GET /users — Consulta paginada de usuários.
     *
     * Fluxo:
     *  1. Extrai e valida os query-params (pagina, por_pagina, classificacao,
     *     busca) usando `validatedQuery` (Zod schema `listUsersQuerySchema`).
     *  2. Invoca `usuariosService.listar()` (delegação de negócio).
     *  3. Monta envelope HTTP 200 com `success<T>()` padronizado.
     *
     * Qualquer erro de validação de query params é lançado pelo helper
     * `validatedQuery` como `AppError(400)` e capturado no `catch` — o handler
     * não precisa de `if` para checar erros de schema.
     *
     * @param req  - Objeto Express Request (query populada após middleware).
     * @param res  - Objeto Express Response (onde escrevemos o JSON 200).
     * @param next - Callback de encaminhamento para error handler em caso de falha.
     */
    async listar(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const filtros = validatedQuery<ListUsersQuery>(req);
            const resultado = await usuariosService.listar(filtros);
            success<PaginatedResponse<Usuario>>(res, resultado, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: GET /users/:id — Consulta de usuário por identificador.
     *
     * Observação de tipagem (coerção segura):
     *   `validatedParams<UserIdParams>(req)` retorna `params.id` como `string`
     *   pois o schema `userIdParamsSchema` é `z.object({ id: z.string() })`.
     *   A conversão para `number` é feita explicitamente por `Number()` aqui
     *   no controller. A escolha de deixar o schema receber string (e não
     *   `z.coerce.number()`) evita comportamento mágico silencioso do Zod
     *   (ex.: `"5abc"` viraria `NaN` no coerce sem mensagem clara). Com
     *   `Number()` o dev vê a coerção e pode adicionar validação de NaN se
     *   necessário — hoje a própria service repassa NaN para o repositório,
     *   que retorna null, e service joga 404 (aceitável por segurança).
     *
     * @param req  - Request com `params.id` (string numérica).
     * @param res  - Response para envelope 200 com dados do usuário.
     * @param next - Error handler forward.
     */
    async buscarPorId(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const params = validatedParams<UserIdParams>(req);
            const id = params.id;
            const usuario = await usuariosService.buscarPorId(id);
            success<Usuario>(res, usuario, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: POST /users — Cadastrar novo usuário (admin/sakai).
     *
     * Segurança (autenticação e autorização):
     *   A rota correspondente em `routes/users.ts` deve encadear os middlewares
     *   `autenticar` → `authAdmin` ANTES deste handler. O controller em si não
     *   revalida permissões — responsabilidade do middleware.
     *
     * Fluxo:
     *  1. `validatedBody<CreateUserDTO>(req)` aplica `createUserSchema` do Zod.
     *     Se o body for inválido → AppError(400) com detalhes dos campos.
     *  2. `usuariosService.criar(dto)`: checa unicidade login/email, faz hash
     *     da senha, persiste. Erro de unicidade aqui vira AppError(409).
     *  3. Resposta HTTP 201 (RFC 9110 § 15.3.2) via `created<T>()` com o
     *     usuário persistido e seu id atribuído pelo banco.
     *
     * Nota sobre response 201: o header `Location` recomendado pela RFC 9110
     * (apontando para `GET /users/:novoId`) pode ser adicionado aqui no futuro
     * ex.: `res.setHeader('Location', \`/users/${usuario.id}\`)` antes de `created()`.
     *
     * @param req  - Request JSON contendo corpo de criação de usuário.
     * @param res  - Response 201 com usuário criado.
     * @param next - Error handler forward.
     */
    async criar(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const dto = validatedBody<CreateUserDTO>(req);
            const requester = (req as AuthRequest).user;
            if (
                dto.classificacao === "sakai" &&
                requester?.classificacao?.trim().toLowerCase() !== "sakai"
            ) {
                throw new AppError("Apenas um superadministrador pode criar outro superadministrador.", 403);
            }
            const usuario = await usuariosService.criar(dto);
            created<UsuarioCriado>(res, usuario, 201);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: PATCH /users/:id — Atualizar dados de um usuário.
     *
     * Utiliza o método PATCH (RFC 5789) em vez de PUT para indicar atualização
     * parcial — campo ausente no body não é sobrescrito. A validação de schema
     * por `UpdateUserDTO` (todos os campos opcionais) assegura essa semântica.
     *
     * Concatena dois conjuntos de validação:
     *  a) `validatedParams` → certifica que `:id` existe e é string não-vazia.
     *  b) `validatedBody`   → certifica que cada campo enviado respeita formato
     *                          (email válido, classificacao ∈ enum etc.).
     *
     * @param req  - Request com params.id + body parcial de atualização.
     * @param res  - Response 200 com a entidade já atualizada.
     * @param next - Error handler forward.
     */
    async atualizar(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const params = validatedParams<UserIdParams>(req);
            const dto = validatedBody<UpdateUserDTO>(req);
            const id = params.id;
            const requester = (req as AuthRequest).user;
            if (
                requester?.id === id &&
                ("classificacao" in dto || "ativo" in dto)
            ) {
                throw new AppError(
                    "Para alterar o próprio perfil ou status, solicite a um administrador.",
                    403
                );
            }
            if (dto.classificacao === "sakai" && requester?.classificacao !== "sakai") {
                throw new AppError("Somente um superadministrador pode atribuir o perfil Sakai.", 403);
            }
            const usuario = await usuariosService.atualizar(id, dto);
            success<Usuario>(res, usuario, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: PATCH /users/me/password — Auto-atualização de senha.
     *
     * Contexto de segurança:
     *   Este handler é protegido pelo middleware `autenticar` (não precisa de
     *   `authAdmin` pois qualquer usuário autenticado pode alterar a própria
     *   senha). O `AuthRequest` enriquecido pelo middleware injeta `req.user`
     *   contendo o `TokenPayload` (jti, id, classificacao, login).
     *
     * Detalhe do cast tipado (`req as AuthRequest`):
     *   Ao contrário do anti-pattern `as unknown`, o cast `req as AuthRequest`
     *   é um "promessa segura" (assured cast) pois o middleware anterior na
     *   pilha (autenticar) garante que se o request chegou até aqui o objeto
     *   já foi augmentado com `.user` não-nulo. Contudo, por robustez (defense
     *   in depth — OWASP ASVS V10), o código ainda verifica a nulidade de
     *   `authReq.user?.id` e responde 401 em caso negativo.
     *
     * Fluxo:
     *  1. Extrai `id` do token (não de params — senão qualquer usuário poderia
     *     alterar a senha de outro se tivesse seu id).
     *  2. Valida `{ senha_atual, nova_senha }` no body via Zod `updateUserPasswordSchema`.
     *  3. Invoca `usuariosService.atualizarSenha(id, dto)`: o service valida
     *     que `senha_atual` bate com o hash persistido antes de gravar a nova.
     *  4. HTTP 204 No Content (sem body), pois não há representação nova para
     *     devolver — a operação é um efeito colateral puro.
     *
     * @param req  - Request tipado como AuthRequest (após middleware).
     * @param res  - Resposta 204 vazia em caso de sucesso.
     * @param next - Error handler forward.
     */
    async atualizarSenhaPropria(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            // Cast seguro: middleware `autenticar` já injetou `.user` em `req`.
            const authReq = req as AuthRequest;
            const dto = validatedBody<UpdateUserPasswordDTO>(req);

            // Recupera o id do usuário AUTENTICADO, não de params.id (evita IDOR).
            const id = authReq.user?.id;
            if (!id) {
                // Defense in depth: se por algum motivo o middleware falhou em
                // popular user.id, devolver 401 sem informar detalhes internos.
                res.sendStatus(401);
                return;
            }

            await usuariosService.atualizarSenha(id, dto);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: PATCH /users/:id/password — Admin altera senha de outro usuário.
     *
     * A diferença em relação a `atualizarSenhaPropria()` é que o `id` alvo vem
     * da URL (`params.id`) e NÃO do token. A autorização para este fluxo é dada
     * pelo middleware `authAdmin` (classificação `admin` ou `sakai`) na rota.
     *
     * Mesmo sendo um admin, a senha atual do usuário alvo ainda precisa ser
     * validada (não há "senha mestra" no sistema — caso tal funcionalidade seja
     * requisitada futuramente, implementar `usuariosService.resetarSenha()`
     * separado com notificação por e-mail e token de uso único, seguindo
     * OWASP ASVS V2.5: password recovery).
     *
     * @param req  - Request com params.id (usuário alvo) e body com senhas.
     * @param res  - Response 204 vazia.
     * @param next - Error handler forward.
     */
    async atualizarSenha(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const params = validatedParams<UserIdParams>(req);
            const dto = validatedBody<UpdateUserPasswordDTO>(req);
            const id = params.id;
            await usuariosService.atualizarSenha(id, dto);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },

    async resetarSenha(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const params = validatedParams<UserIdParams>(req);
            const dto = validatedBody<ResetUserPasswordDTO>(req);
            await usuariosService.resetarSenha(params.id, dto.nova_senha);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: DELETE /users/:id — Excluir usuário por id.
     *
     * Segurança:
     *   Rota restrita a classificação `sakai` (super-usuário) via middleware
     *   `authAdmin` + configuração de roles em `routes/users.ts`. Nenhum outro
     *   nível (nem admin) pode apagar registros, por LGPD (art. 18 — direito
     *   ao esquecimento só pode ser executado pelo Controlador de Dados ou
     *   operador credenciado de maior escalão).
     *
     * Resposta 204 No Content (RFC 9110 § 15.3.5): adequado pois após a
     * exclusão não há representação do recurso para retornar no payload.
     *
     * @param req  - Request com params.id a ser deletado.
     * @param res  - Response 204 vazia em caso de sucesso.
     * @param next - Error handler forward.
     */
    async deletar(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const params = validatedParams<UserIdParams>(req);
            const id = params.id;
            await usuariosService.deletar(id);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },
};

/**
 * Exportação default do barrel para importação unificada em `routes/users.ts`.
 */
export default usersController;
