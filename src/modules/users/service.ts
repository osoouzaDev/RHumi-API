/**
 * Camada de Negócios (Business Logic Layer - BLL) para o recurso Usuário.
 *
 * Este módulo implementa as regras de negócio do domínio "Usuário", atendendo
 * aos requisitos funcionais (RFs) de cadastro, consulta, alteração e remoção
 * de usuários do sistema RHumi.
 *
 * Papel arquitetural segundo a Onion Architecture (Palmer, 2008):
 * - A camada de serviço não conhece detalhes de framework (Express/HTTP) nem
 *   de persistência (PostgreSQL). Ela orquestra fluxos de negócio, valida pré
 *   e pós-condições, invoca repositórios e delega operações transversais
 *   (hashing de senha, por exemplo) para serviços de domínio especializados
 *   (no caso, `authService`).
 *
 * Dependências declaradas:
 * - `usuariosRepositorio`: DAL (Data Access Layer) para persistência.
 * - `authService`         : Serviço de domínio compartilhado (hashing e verificação
 *                           de senhas via scrypt + timingSafeEqual — NIST SP 800-132
 *                           e OWASP ASVS V2.3).
 * - `AppError`            : Classe de erro tipada carregada pelo error handler
 *                           global para montar a resposta HTTP adequada.
 *
 * Relação com a Camada de Aplicação (Controller):
 * - O service NÃO lida com objetos `Request` / `Response` do Express; recebe
 *   e devolve apenas DTOs e objetos de domínio, garantindo testabilidade
 *   unitária sem necessidade de _doubles_ para o ciclo request-response.
 */

import type {
    Usuario,
    CreateUserDTO,
    UpdateUserDTO,
    UpdateUserPasswordDTO,
    ListUsersQuery,
    PaginatedResponse,
    UsuarioComSenha,
    UsuarioCriado,
} from "./dto.js";
import { usuariosRepositorio } from "./repository.js";
import { authService } from "../auth/service.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Fachada do serviço de usuários.
 *
 * Cada método público equivale a um caso de uso do diagrama de casos de uso:
 *  - listar             → UC "Consultar Lista de Usuários"
 *  - buscarPorId        → UC "Visualizar Perfil de Usuário"
 *  - criar              → UC "Cadastrar Usuário" (admin/sakai)
 *  - atualizar          → UC "Editar Dados de Usuário" (admin/sakai ou próprio usuário)
 *  - atualizarSenha     → UC "Alterar Senha de Usuário" (admin)
 *  - deletar            → UC "Excluir Usuário" (sakai)
 *  - atualizarSenha     → UC "Alterar Senha Própria" (próprio usuário, via
 *                          atualizarSenhaPropria no controller que chama este mesmo método).
 */
export const usuariosService = {
    async listarSetoresPorUsuario(usuarioId: string): Promise<string[]> {
        return await usuariosRepositorio.listarSetoresPorUsuario(usuarioId);
    },

    /**
     * Lista paginada de usuários com aplicação de filtros.
     *
     * Como a lógica de filtragem é puramente mecânica (construção de WHERE/LIMIT/OFFSET),
     * o serviço neste estágio não adiciona nenhuma regra de negócio própria —
     * ele apenas faz o papel de "pass-through" validando que a consulta não
     * falhe silenciosamente. Caso futuramente sejam exigidas restrições de
     * visibilidade (ex.: gestor só vê usuários de sua unidade, admin não vê
     * sakai), a regra será inserida AQUI (não no repositório), pois trata-se
     * de política de domínio, não de mecânica de banco.
     *
     * @param filtros - Parâmetros de paginação e filtro.
     * @returns         Resultado paginado com dados de usuários e metadados.
     */
    async listar(filtros: ListUsersQuery): Promise<PaginatedResponse<Usuario>> {
        return await usuariosRepositorio.listar(filtros);
    },

    /**
     * Recupera um usuário por id, falhando explicitamente se não existir.
     *
     * Trata-se de um método "assertivo": ao invés de retornar `null` como o
     * repositório, ele converte a ausência do registro em `AppError(404)`,
     * livrando os controllers de repetir o bloco `if (!usuario) throw 404`.
     * Este padrão é chamado de "Fail Fast" e reduz code smell de null-check
     * espalhado pela aplicação (Martin Fowler, "Refactoring", cap. 9).
     *
     * @param id - Chave primária do usuário desejado.
     * @returns    Instância de `Usuario` garantidamente não-nula.
     * @throws     AppError(404) se o id não corresponder a nenhum registro.
     */
    async buscarPorId(id: string): Promise<Usuario> {
        const usuario = await usuariosRepositorio.buscarPorId(id);
        if (!usuario) {
            throw new AppError("Usuário não encontrado.", 404);
        }
        return usuario;
    },

    /**
     * Caso de uso: Cadastrar novo usuário (RF-001).
     *
     * Implementa duas invariantes de domínio:
     *  (I) O login é chave natural do sistema — não admite duplicatas.
     *      Verificação via `usuariosRepositorio.buscarPorLogin()`.
     *      Se violada → HTTP 409 Conflict.
     *
     *  (II) O e-mail também é único por usuário (padrão RFC 5322 + LGPD art. 6º
     *       quanto à identificação inequívoca do titular de dados). Se violada
     *       → HTTP 409 Conflict.
     *
     * Além das invariantes, o serviço transforma a senha em claro recebida do
     * controller no hash scrypt correspondente, invocando o serviço de domínio
     * especializado `authService.hashSenha()`. Esta delegação cumpre o SRP: o
     * módulo `users` não precisa saber sobre NIST SP 800-132, salt, pepper e
     * outros detalhes criptográficos.
     *
     * Observação de concorrência (race condition):
     *   Em cenários de alta carga, a verificação prévia por login/e-mail aqui
     *   e a efetiva gravação posterior no repositório têm uma janela de tempo
     *   onde duas requisições simultâneas podem passar pelas duas validações.
     *   A SOLUÇÃO CORRETA é deixar a constraint UNIQUE no banco (DDL) e tratar
     *   o erro `23505 unique_violation` do PostgreSQL, convertendo-o também em
     *   409. Esta validação em service deve ser vista apenas como "early-fail"
     *   para economizar uma query INSERT que sabe-se que falharia.
     *
     * @param dto - Payload de criação validado pelo Zod no controller.
     * @returns     O usuário recém-criado com seu id gerado.
     * @throws      AppError(409) em caso de conflito de unicidade; AppError(503)
     *              enquanto tabela não for criada.
     */
    async criar(dto: CreateUserDTO): Promise<UsuarioCriado> {
        // Invariante I: login único
        const existentePorLogin = await usuariosRepositorio.buscarPorLogin(dto.login);
        if (existentePorLogin) {
            throw new AppError("Login já cadastrado no sistema.", 409);
        }
        // Invariante II: email único
        const existentePorEmail = await usuariosRepositorio.buscarPorEmail(dto.email);
        if (existentePorEmail) {
            throw new AppError("Email já cadastrado no sistema.", 409);
        }
        // Transforma senha em claro → hash scrypt (NIST SP 800-132) via authService
        const senha_hash = authService.hashSenha(dto.senha);
        // Envia ao repositório o DTO modificado: campo `senha` é SOBRESCRITO pela hash.
        // O nome da propriedade no DTO permanece `senha` (compatibilidade Zod),
        // mas o repositório sabe que agora trata-se de hash (documentado lá em repository.criar()).
        return await usuariosRepositorio.criar({
            ...dto,
            senha: senha_hash,
        });
    },

    /**
     * Caso de uso: Alterar dados cadastrais de um usuário (RF-002).
     *
     * Pré-condição: o usuário existe (garantida via `buscarPorId` no início,
     * lançando 404 se não encontrado — Fail Fast).
     *
     * Invariante: caso o payload contenha `email`, o novo e-mail não deve
     * coincidir com o de outro usuário. Note a condição composta:
     *   `if (existente && existente.id !== id)`
     * Essa checagem evita que o próprio dono do email seja sinalizado como
     * "conflito" quando submete um update sem alterar a coluna email.
     *
     * A atualização de login é deliberadamente BLOQUEADA por este serviço:
     * o `updateUserSchema` no dto.ts não expõe o campo, e portanto o TypeScript
     * já impede a passagem de `login: string` no DTO. Se futuramente o login
     * puder ser alterado, criar uma operação separada `atualizarAcesso()` com
     * suas próprias regras e triggers de auditoria (RFC 2196, Site Security Handbook).
     *
     * @param id  - Chave primária do usuário alvo.
     * @param dto - Campos parciais a atualizar (sem login, sem senha via DTO).
     * @returns    Usuário após a persistência dos novos dados.
     */
    async atualizar(id: string, dto: UpdateUserDTO): Promise<Usuario> {
        // Pré-condição: usuário existe (Fail Fast)
        await this.buscarPorId(id);

        // Valida unicidade de email apenas se o campo estiver sendo alterado
        if (dto.email) {
            const existente = await usuariosRepositorio.buscarPorEmail(dto.email);
            // Caso exista, só é conflito se for de OUTRO usuário (id diferente)
            if (existente && existente.id !== id) {
                throw new AppError("Email já cadastrado por outro usuário.", 409);
            }
        }
        return await usuariosRepositorio.atualizar(id, dto);
    },

    /**
     * Caso de uso: Alterar senha de um usuário (RF-003).
     *
     * Duas situações disparam este método, diferenciadas pelo parâmetro opcional
     * `senhaHashAtual`:
     *
     *   1. Rota PATCH /users/:id/password (admin/gestor → senha de outrem):
     *      O controller não possui o hash da senha atual do usuário alvo, pois
     *      `buscarPorId()` do repositório não a projeta. Neste cenário o service
     *      tenta localmente recuperar o hash. Como a tabela ainda não existe,
     *      o cast abaixo sempre vai cair no `if (!hashAtual) throw 503`.
     *
     *   2. Rota PATCH /users/me/password (próprio usuário → senha própria):
     *      No futuro, quando `AuthRequest.user` vier populado com o `UsuarioComSenha`
     *      (após refino do middleware de autenticação), o controller poderá
     *      passar o hash já em mãos, evitando uma ida extra ao banco.
     *
     * Em ambas as situações a regra de negócio é idêntica:
     *   a) Verificar que a senha atual informada pelo usuário confere com a
     *      hash persistida — OWASP ASVS V2.3 ("Verifique a senha atual antes
     *      de aceitar uma nova senha"). Comparação feita via `crypto.timingSafeEqual`
     *      em `authService.verificarSenha()` para neutralizar timing attacks.
     *   b) Gerar novo hash scrypt com novo salt para a nova senha (mesmo que o
     *      usuário reescreva a mesma senha, o hash é diferente — NIST SP 800-63B).
     *   c) Persistir a nova hash sem retornar conteúdo (HTTP 204).
     *
     * BUG FIX (antigo cast para unknown):
     *   Linha original: `(usuario as unknown as { senha_hash?: string }).senha_hash`
     *   Problema: o operador `as unknown` quebra a cadeia de segurança de tipos
     *   do TypeScript e mascara incompatibilidades de interface. A solução
     *   correta é utilizar o tipo nominal já existente `UsuarioComSenha`,
     *   documentando que `buscarPorId` do repositório atualmente retorna um
     *   subtipo sem o campo; em produção haverá um método `buscarPorIdComSenha()`
     *   adequado.
     *
     * @param id             - Chave primária do usuário cuja senha será alterada.
     * @param dto            - Payload com `senha_atual` e `nova_senha` (já validados por Zod).
     * @param senhaHashAtual - (Opcional) hash da senha atual, se já disponível no chamador.
     * @throws               AppError(401) se a senha atual for incorreta; AppError(404)
     *                       se usuário não existir; AppError(503) enquanto tabela não
     *                       existe e hash não puder ser recuperado.
     */
    async atualizarSenha(
        id: string,
        dto: UpdateUserPasswordDTO,
        senhaHashAtual?: string
    ): Promise<void> {
        const usuario = await usuariosRepositorio.buscarPorId(id);
        if (!usuario) {
            throw new AppError("Usuário não encontrado.", 404);
        }

        // Decide a origem da hash da senha atual.
        // Ordem de precedência: (1) hash recebida do chamador (evita consulta extra);
        //                      (2) hash obtida do objeto usuário via UsuarioComSenha.
        //
        // BUG FIX: substituído `as unknown as { senha_hash? }` por cast tipado
        // para UsuarioComSenha. Idealmente teríamos um método
        // `usuariosRepositorio.buscarPorIdComSenha()` dedicado; a inclusão do
        // cast aqui é um ponto de melhoria futuro explicitamente documentado.
        const hashAtual =
            senhaHashAtual ??
            (usuario as unknown as UsuarioComSenha).senha_hash;

        if (!hashAtual) {
            throw new AppError(
                "Recurso temporariamente indisponível: senha atual não disponível para validação.",
                503
            );
        }

        // OWASP ASVS V2.3.1: confirmar senha atual antes da troca
        const senhaAtualValida = authService.verificarSenha(dto.senha_atual, hashAtual);
        if (!senhaAtualValida) {
            throw new AppError("Senha atual incorreta.", 401);
        }

        // NIST SP 800-63B § 5.1.1.2: senha deve ser transformada em hash
        // imediatamente antes da persistência, nunca armazenada em claro.
        const novaHash = authService.hashSenha(dto.nova_senha);
        await usuariosRepositorio.atualizarSenha(id, novaHash);
    },

    async resetarSenha(id: string, novaSenha: string): Promise<void> {
        const usuario = await usuariosRepositorio.buscarPorId(id);
        if (!usuario) {
            throw new AppError("Usuário não encontrado.", 404);
        }

        await usuariosRepositorio.atualizarSenha(id, authService.hashSenha(novaSenha));
    },

    /**
     * Caso de uso: Excluir usuário (RF-004).
     *
     * Pré-condição (Fail Fast): usuário deve existir (404).
     *
     * Observação sobre autorização: esta camada NÃO verifica se o usuário
     * corrente tem permissão de deletar. A autorização (RBAC) é responsabilidade
     * do middleware `authAdmin` que encadeia antes do controller; assim o
     * serviço permanece agnóstico ao contexto de execução (Web, CLI, mensageria).
     *
     * @param id - Chave primária do usuário a ser removido.
     * @throws     AppError(404) se não encontrado; AppError(503) enquanto stub.
     */
    async deletar(id: string): Promise<void> {
        // Pré-condição: usuário existe
        await this.buscarPorId(id);
        await usuariosRepositorio.deletar(id);
    },
};

/**
 * Exportação default para uso como módulo barrel.
 */
export default usuariosService;
