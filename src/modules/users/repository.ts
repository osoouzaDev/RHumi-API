/**
 * Camada de Acesso a Dados (Data Access Layer - Repositório) para a entidade Usuário.
 *
 * Este módulo implementa o padrão Repository (Fowler, 2002), encapsulando toda a
 * lógica de persistência e recuperação de objetos do domínio `Usuario` no SGBD.
 *
 * Finalidade arquitetural (SRP - Single Responsibility Principle):
 * - Isolar a camada de negócios (Service) dos detalhes tecnológicos do mecanismo
 *   de armazenamento (SQL do PostgreSQL, driver pg.Pool, índices, joins).
 * - Permitir a substituição da estratégia de persistência (ex.: mock para testes
 *   unitários) sem impacto na camada de serviço.
 * - Centralizar queries parametrizadas, evitando duplicação e SQL Injection.
 *
 * A tabela de usuários é `public.usuario`, conforme a migration inicial.
 *
 * Observações de Segurança (OWASP SQL Injection Prevention Cheat Sheet):
 * - Todas as queries reais a serem implementadas DEVEM utilizar parametrização
 *   placeholders (`$1`, `$2`, ...) fornecidas pelo driver `pg`; NUNCA concatenar
 *   strings de entrada do usuário na consulta SQL.
 * - Nunca retornar `senha_hash` em operações de listagem/leitura geral; o campo
 *   só deve ser exposto por `buscarPorLogin()` e um eventual `buscarPorIdComSenha()`
 *   exclusivamente para fins de autenticação e validação de senha atual.
 */

import type {
    Usuario,
    UsuarioComSenha,
    CreateUserDTO,
    UpdateUserDTO,
    ListUsersQuery,
    PaginatedResponse,
} from "./dto.js";
import { banco } from "../../database/connection.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Fachada do repositório de usuários.
 *
 * Implementa um objeto literal (strategy pattern aplicado a DAL) com todos os
 * pontos de contato com a tabela `usuarios`. Em projetos que adotam injeção de
 * dependência (DIP - Dependency Inversion Principle), esta fachada seria
 * substituída por uma classe que implementa uma interface `IUsuariosRepository`.
 * Para o escopo atual (MVP), o padrão singleton-export é suficiente e mantém
 * a complexidade acidental baixa.
 */
export const usuariosRepositorio = {
    /**
     * Lista usuários com suporte a paginação e filtros por classificação e busca textual.
     *
     * O método corresponde ao caso de uso "Consultar Usuários" (gestor/admin).
     * Implementação provisória retorna coleção vazia; a versão definitiva deverá:
     * 1. Aplicar `WHERE` condicional para `classificacao` (se informada).
     * 2. Aplicar `ILIKE '%termo%'` nos campos `nome`, `login`, `email` (se `busca`).
     * 3. Realizar contagem total (`COUNT(*) OVER()`) para alimentar `meta.total`.
     * 4. Aplicar cláusulas `LIMIT por_pagina OFFSET (pagina-1)*por_pagina`.
     * 5. Nunca projetar a coluna `senha_hash` no resultado.
     *
     * @param filtros - Objeto contendo paginação (pagina, por_pagina) e filtros
     *                  opcionais (classificacao, busca).
     * @returns        Resposta paginada tipada como `PaginatedResponse<Usuario>`.
     */
    async listar(filtros: ListUsersQuery): Promise<PaginatedResponse<Usuario>> {
        const pagina = Number.isFinite(Number(filtros.pagina)) ? Number(filtros.pagina) : 1;
        const porPagina = Number.isFinite(Number(filtros.por_pagina)) ? Number(filtros.por_pagina) : 20;
        const offset = (pagina - 1) * porPagina;

        const totalResult = await banco.query(
            "SELECT COUNT(*)::int AS total FROM usuario"
        );

        const rowsResult = await banco.query(
            `
                SELECT
                    id::text AS id,
                    nome,
                    email,
                    email AS login,
                    'admin'::text AS classificacao,
                    ativo,
                    created_at AS data_criacao,
                    updated_at AS data_atualizacao
                FROM usuario
                ORDER BY created_at DESC
                LIMIT $1 OFFSET $2
            `,
            [porPagina, offset]
        );

        const total = Number(totalResult.rows[0]?.total ?? 0);
        const dados = rowsResult.rows.map((row) => ({
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: "admin" as const,
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        }));

        return {
            dados,
            meta: {
                pagina,
                por_pagina: porPagina,
                total,
                total_paginas: Math.max(1, Math.ceil(total / porPagina)),
            },
        };
    },

    /**
     * Recupera um usuário por sua chave primária (id).
     *
     * Equivalente SQL: SELECT id, nome, login, email, classificacao, ativo,
     *                        created_at, updated_at
     *                   FROM usuarios WHERE id = $1
     *
     * NÃO projete a coluna `senha_hash` neste método — ele é utilizado pelas
     * rotas públicas de consulta de perfil (ex.: `GET /users/:id`) onde a hash
     * nunca deve trafegar na resposta. Se precisar da hash em alguma regra de
     * negócio (ex.: validação de senha atual), crie um método dedicado como
     * `buscarPorIdComSenha()` para deixar a intenção explícita.
     *
     * @param id - Chave primária numérica do usuário.
     * @returns    Instância de `Usuario` ou `null` se não encontrado.
     */
    async buscarPorId(id: string): Promise<Usuario | null> {
        const result = await banco.query(
            `
                SELECT
                    id::text AS id,
                    nome,
                    email,
                    email AS login,
                    'admin'::text AS classificacao,
                    ativo,
                    created_at AS data_criacao,
                    updated_at AS data_atualizacao
                FROM usuario
                WHERE id = $1
                LIMIT 1
            `,
            [id]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: "admin",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        };
    },

    /**
     * Recupera um usuário (COM SENHA_HASH) pelo identificador de login.
     *
     * Este método é um contrato exclusivo da camada de autenticação
     * (`authService`) e NUNCA deve ser invocado por controllers de CRUD comum.
     * É o único ponto do repositório (junto de um futuro `buscarPorIdComSenha`)
     * que projeta a coluna sensível `senha_hash`, necessário para o algoritmo
     * de verificação de senha via `timingSafeEqual` em `authService.verificarSenha()`.
     *
     * Equivalente SQL: SELECT * (ou explicitamente id, nome, login, email,
     *                         classificacao, ativo, senha_hash, ...)
     *                   FROM usuarios WHERE login = $1 AND ativo = true
     *
     * @param login - Identificador único de login (único no banco).
     * @returns       Instância `UsuarioComSenha` ou `null` se não encontrado.
     */
    async buscarPorLogin(login: string): Promise<UsuarioComSenha | null> {
        const result = await banco.query(
            `
                SELECT
                    id::text AS id,
                    nome,
                    email,
                    email AS login,
                    senha_hash,
                    'admin'::text AS classificacao,
                    ativo,
                    created_at AS data_criacao,
                    updated_at AS data_atualizacao
                FROM usuario
                WHERE LOWER(email) = LOWER($1)
                   OR LOWER(nome) = LOWER($1)
                ORDER BY created_at DESC
                LIMIT 1
            `,
            [login]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: "admin",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
            senha_hash: String(row.senha_hash),
        };
    },

    /**
     * Recupera um usuário pelo endereço de e-mail.
     *
     * Utilizado principalmente pelas regras de unicidade de e-mail nos métodos
     * `usuariosService.criar()` e `usuariosService.atualizar()`. A query real
     * deve realizar uma busca CASE-INSENSITIVE (ex.: `WHERE LOWER(email) = LOWER($1)`)
     * caso o banco não tenha um índice `citext` ou constraint unique com `citext`.
     *
     * @param email - Endereço de correio eletrônico do usuário.
     * @returns       Instância `Usuario` ou `null`.
     */
    async buscarPorEmail(email: string): Promise<Usuario | null> {
        const result = await banco.query(
            `
                SELECT
                    id::text AS id,
                    nome,
                    email,
                    email AS login,
                    'admin'::text AS classificacao,
                    ativo,
                    created_at AS data_criacao,
                    updated_at AS data_atualizacao
                FROM usuario
                WHERE LOWER(email) = LOWER($1)
                LIMIT 1
            `,
            [email]
        );

        const row = result.rows[0];
        if (!row) return null;

        return {
            id: String(row.id),
            login: String(row.login ?? row.email),
            nome: String(row.nome),
            email: String(row.email),
            classificacao: "admin",
            ativo: Boolean(row.ativo),
            data_criacao: new Date(row.data_criacao as string).toISOString(),
            data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
        };
    },

    /**
     * Persiste um novo usuário na tabela `usuarios`.
     *
     * Regras de pré-condição (já garantidas por `usuariosService.criar()`):
     * - `dto.login` é único em relação aos registros existentes (verificado via
     *   `buscarPorLogin`).
     * - `dto.email` é único em relação aos registros existentes (verificado via
     *   `buscarPorEmail`).
     * - O campo `dto.senha` já contém o HASH da senha (NÃO a senha em claro),
     *   produzido por `authService.hashSenha()`; a coluna destino deve ser
     *   `senha VARCHAR(255)` — ou o nome exato `senha_hash` — para comportar
     *   o prefixo `$scrypt$` + salt + hash do NIST SP 800-132.
     *
     * A query real deve utilizar `INSERT ... RETURNING id, nome, login, email,
     * classificacao, ativo, created_at, updated_at` para já devolver a
     * instância criada sem nova consulta, SEM retornar `senha_hash`.
     *
     * @param _dto - Payload de criação (campo `senha` já substituído pela hash).
     * @returns      O usuário recém-criado com os campos públicos.
     * @throws       AppError(503) enquanto a tabela não existir.
     */
    async criar(dto: CreateUserDTO): Promise<Usuario> {
        const idEmpresa = process.env.DEFAULT_EMPRESA_ID?.trim();

        if (!idEmpresa) {
            throw new AppError(
                "Não foi possível criar o usuário: DEFAULT_EMPRESA_ID não está configurada.",
                500
            );
        }

        try {
            const result = await banco.query(
                `
                    INSERT INTO public.usuario
                        (id_empresa, nome, email, senha_hash, ativo)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING
                        id::text AS id,
                        nome,
                        email,
                        ativo,
                        created_at AS data_criacao,
                        updated_at AS data_atualizacao
                `,
                [idEmpresa, dto.nome, dto.email, dto.senha, dto.ativo]
            );

            const row = result.rows[0];
            if (!row) {
                throw new Error("O banco não retornou o usuário criado.");
            }

            return {
                id: String(row.id),
                login: dto.login,
                nome: String(row.nome),
                email: String(row.email),
                classificacao: dto.classificacao,
                ativo: Boolean(row.ativo),
                data_criacao: new Date(row.data_criacao as string).toISOString(),
                data_atualizacao: new Date(row.data_atualizacao as string).toISOString(),
            };
        } catch (error: unknown) {
            if (error && typeof error === "object" && "code" in error && error.code === "23505") {
                throw new AppError("Email já cadastrado no sistema.", 409);
            }

            throw error;
        }
    },

    /**
     * Atualiza campos de um usuário existente (exceto `senha` e `login`, via regra de negócio).
     *
     * A query real deve fazer `UPDATE usuarios SET col1 = $1, ..., updated_at = NOW()
     * WHERE id = $N RETURNING id, nome, login, email, classificacao, ativo, created_at, updated_at`.
     *
     * Observação: a atualização de senha tem seu método dedicado (`atualizarSenha`)
     * para preservar a cadeia de custódia do processo de troca (validação da
     * senha atual, nova passagem pelo hashing).
     *
     * @param _id  - Chave primária do usuário alvo.
     * @param _dto - Campos parciais a serem atualizados (todos opcionais no schema).
     * @returns     O usuário após atualização (projeção sem senha_hash).
     * @throws      AppError(503) enquanto a tabela não existir.
     */
    async atualizar(_id: string, _dto: UpdateUserDTO): Promise<Usuario> {
        throw new AppError(
            "Recurso temporariamente indisponível: tabela de usuários ainda não foi criada no banco de dados.",
            503
        );
    },

    /**
     * Atualiza exclusivamente a coluna `senha_hash` de um usuário.
     *
     * A separação deste método de `atualizar()` segue o ISP (Interface Segregation
     * Principle) — controllers e serviços que só precisam alterar a senha não
     * recebem acesso a campos não relacionados, e a auditoria é facilitada.
     *
     * Query real: `UPDATE usuarios SET senha_hash = $1, updated_at = NOW() WHERE id = $2`.
     * Note que a operação não retorna nada (void), em conformidade com o Status
     * Code HTTP 204 (No Content) que as rotas de alteração de senha respondem.
     *
     * @param _id         - Chave primária do usuário alvo.
     * @param _senhaHash  - Hash scrypt já produzida por `authService.hashSenha()`.
     * @throws            AppError(503) enquanto a tabela não existir.
     */
    async atualizarSenha(_id: string, _senhaHash: string): Promise<void> {
        throw new AppError(
            "Recurso temporariamente indisponível: tabela de usuários ainda não foi criada no banco de dados.",
            503
        );
    },

    /**
     * Remove (exclusão lógica ou física) um usuário da base.
     *
     * A decisão entre exclusão lógica (SET ativo = false) e exclusão física
     * (DELETE FROM) deve ser documentada na política de retenção de dados
     * (LGPD — Lei Geral de Proteção de Dados, art. 15 a 18). Para sistemas RH,
     * recomenda-se exclusão lógica por padrão, pois histórico funcional de
     * colaboradores muitas vezes precisa ser preservado por prazo legal.
     *
     * Se adotar exclusão lógica, adaptar também `buscarPorLogin` para filtrar
     * `WHERE ativo = true` (usuários inativos não podem autenticar).
     *
     * @param _id - Chave primária do usuário a ser removido.
     * @throws     AppError(503) enquanto a tabela não existir.
     */
    async deletar(_id: string): Promise<void> {
        throw new AppError(
            "Recurso temporariamente indisponível: tabela de usuários ainda não foi criada no banco de dados.",
            503
        );
    },

    /**
     * Método de conveniência para a camada de autenticação.
     *
     * Responsabilidade única: recuperar o registro pelo login e entregar ao
     * chamador para que ele próprio execute a comparação de senha (delegação
     * correta para não espalhar `timingSafeEqual` por todas as camadas).
     *
     * Atualmente o parâmetro `_senha` não é consumido neste stub pois a
     * verificação de senha é de responsabilidade de `authService.verificarSenha()`.
     * Manter a assinatura com o parâmetro preserva a interface pública caso
     * deseje-se futuramente mover a verificação para dentro do próprio banco
     * (ex.: stored function `criar_senha`), embora tal prática seja desaconselhada
     * por reduzir a auditabilidade e dificultar a rotação de algoritmos de hash.
     *
     * @param login  - Login do usuário credenciado.
     * @param _senha - Senha em claro fornecida no request (não usada aqui).
     * @returns      Instância completa do usuário (com senha_hash) ou null.
     */
    async verificarCredenciais(
        login: string,
        _senha: string
    ): Promise<UsuarioComSenha | null> {
        const usuario = await this.buscarPorLogin(login);
        if (!usuario) return null;
        return usuario;
    },
};

/**
 * Exportação default (padrão barrel) para uso genérico.
 * Exportação nomeada (acima) mantida para importações seletivas e tree-shaking.
 */
export default usuariosRepositorio;
