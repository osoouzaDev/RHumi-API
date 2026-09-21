/**
 * Arquivo Barrel (Barrel File / Re-export Aggregator) para o módulo `users`.
 *
 * Conceito de Barrel File:
 *   Trata-se de um padrão de organização TypeScript/ES Modules que consiste em
 *   um arquivo de índice (`index.ts`) que reexporta símbolos de múltiplos
 *   submódulos internos do pacote. Seu propósito é simplificar as declarações
 *   de importação pelos consumidores externos (controllers de outros módulos,
 *   arquivos de rota, entry points da aplicação).
 *
 * Benefícios arquiteturais:
 * 1. Encapsulamento (Information Hiding, Parnas 1972):
 *    Consumidores não precisam conhecer a estrutura interna de pastas
 *    (dto.ts, service.ts, repository.ts, controller.ts). Apenas importam do
 *    "pacote" `./users`; reorganizá-los internamente não quebra imports
 *    externos, desde que este barrel seja preservado.
 * 2. Interface pública explícita:
 *    A lista de exports abaixo define exatamente o que é "API pública" do
 *    módulo — símbolos omitidos são efetivamente "package-private", mesmo em
 *    ausência de modificador nativo no JavaScript/TypeScript.
 * 3. Tree-shaking:
 *    Usamos `export type { ... }` para tipos e `export { ... }` para valores
 *    (schemas Zod, classes, objetos literais). A distinção permite a bundlers
 *    (esbuild, rollup, webpack) eliminar código morto no build final.
 *
 * Ordem de exportação (convenção local):
 *   Primeiro `export` de VALORES (schemas, constantes, objetos com métodos)
 *   seguido de `export type` para TIPOS (DTOs, interfaces de domínio).
 */

// ——— Exportação de VALORES (serão runtime values: objetos Zod, factories etc.) ———
export {
    createUserSchema,
    updateUserSchema,
    updateUserPasswordSchema,
    userIdParamsSchema,
    listUsersQuerySchema,
    classificacaoEnum,
} from "./dto.js";
// ——— Exportação de TIPOS (apenas tempo de compilação; ausentes em runtime) ———
export type {
    CreateUserDTO,
    UpdateUserDTO,
    UpdateUserPasswordDTO,
    UserIdParams,
    ListUsersQuery,
    Usuario,
    UsuarioComSenha,
    PaginatedResponse,
    Classificacao,
} from "./dto.js";
