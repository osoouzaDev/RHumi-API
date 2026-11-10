/**
 * Camada de Negócios (Service Layer) para o recurso "Relatórios".
 *
 * Responsabilidades desta camada no subdomínio de relatórios:
 *   1. Manter o catálogo público de relatórios disponíveis (método `listarDisponiveis()`).
 *   2. Executar a validação semântica (cross-field) do pedido de emissão
 *      antes de encaminhar para a camada de dados (neste momento, stub).
 *   3. Construir o objeto de domínio `Relatorio` completo com:
 *        - id de rastreabilidade (UUID v4);
 *        - data_geracao do emissão;
 *        - período (se informado no DTO);
 *        - sumário agregado por tipo;
 *        - conjunto de dados (em fase de stub = array vazio).
 *   4. Delegar, futuramente, para repositórios de materialização de consultas
 *      analíticas (views de banco, CTEs, tables `auditoria_autenticacoes`).
 *
 * Observação arquitetural:
 *   Relatórios são casos de uso tipicamente "read-side" em arquiteturas CQRS
 *   (Command Query Responsibility Segregation — Young, 2010). Como o RHumi
 *   ainda não adota CQRS formalmente, a service apenas delega ao repositório
 *   de domínio; quando a volumetria crescer, podemos introduzir models de
 *   consulta separados (ex.: `usuarios_ativos_view`) sem tocar nos comandos.
 */

import { randomUUID } from "node:crypto";
import type { GenerateReportDTO, Relatorio, RelatorioListagem } from "./dto.js";
import { RELATORIOS_DISPONIVEIS } from "./dto.js";
import { AppError } from "../../shared/errors/app-error.js";

/**
 * Fachada singleton do serviço de relatórios.
 *
 * Dois casos de uso públicos:
 *   (A) listarDisponiveis → UC "Consultar Catálogo de Relatórios".
 *   (B) gerar             → UC "Emitir Relatório Gerencial".
 */
export const relatoriosService = {
    /**
     * Retorna o catálogo de relatórios publicados para o tenant atual.
     *
     * Nesta fase de MVP retorna a constante `RELATORIOS_DISPONIVEIS` diretamente.
     * Futuramente — caso os relatórios passem a ser configuráveis por tenant —
     * este método consultaria a tabela `catalogo_relatorios` com base no id do
     * cliente logado (extraído do JWT via AuthRequest).
     *
     * @returns Lista tipada de `RelatorioListagem` (tipo, descrição, params).
     */
    listarDisponiveis(): RelatorioListagem[] {
        return RELATORIOS_DISPONIVEIS;
    },

    /**
     * Caso de uso: Emitir relatório gerencial (RF-005).
     *
     * Pipeline de execução:
     *
     *   1. Validação de tipo — `definicao` é localizada no catálogo via `.find`.
     *      Se não encontrada → AppError(400). A redundância com o Zod schema
     *      é intencional (defense in depth): o schema filtra no ingress da API
     *      e a service revalida em caso de chamadas diretas por outros
     *      módulos internos (ex.: job scheduler dispara relatório via CLI).
     *
     *   2. Validação de janela — se ambas as datas são informadas,
     *      `data_inicio ≤ data_fim`. Resposta HTTP 422 (Unprocessable Entity,
     *      RFC 9110 § 15.6.25) distingue a "semântica inválida" de "sintaxe
     *      inválida" (400).
     *
     *   3. Consulta materializada (STUB por enquanto):
     *      Em produção, `dados` deve ser preenchido com query real contra
     *      tabelas de usuários e auditoria. `sumario` é montado a partir
     *      do tipo (abaixo no helper `gerarSumario()`).
     *
     *   4. Montagem do envelope `Relatorio`:
     *      Gera UUID (RFC 4122) via `crypto.randomUUID()`, timestamp ISO,
     *      total_registros = dados.length (auto-calculado para não dessincronizar).
     *
     * Tratamento de período:
     *   - Se ao menos UMA data for informada, o objeto `periodo` é populado.
     *   - A substituição `?? undefined` garante que a interface seja
     *     cumprida mesmo se ambas forem omitidas.
     *
     * @param dto - Payload de solicitação validado pelo Zod em controller.
     * @returns     Relatório completo com metadados + sumário + dados.
     * @throws      AppError(400) se tipo não existir; AppError(422) se datas inconsistentes.
     */
    async gerar(dto: GenerateReportDTO): Promise<Relatorio> {
        // 1. Catálogo: verifica existência (redundante porém segura)
        const definicao = RELATORIOS_DISPONIVEIS.find((r) => r.tipo === dto.tipo);
        if (!definicao) {
            throw new AppError("Tipo de relatório não suportado.", 400);
        }
        // 2. Cross-field validation: data_inicio <= data_fim (apenas se ambas presentes)
        if (dto.data_inicio && dto.data_fim && Date.parse(dto.data_inicio) > Date.parse(dto.data_fim)) {
            throw new AppError("data_inicio deve ser anterior ou igual a data_fim.", 422);
        }

        console.debug(
            "[RelatoriosService] gerar() - Relatório simulado. Tabelas de auditoria ainda não implementadas.",
            dto
        );

        // 3. Sumário agregado por tipo
        const sumario = this.gerarSumario(dto.tipo);
        // STUB: `dados` permanece vazio enquanto tabelas de leitura não existem.
        // Substituir por queries reais quando o DDL de `usuarios` e
        // `auditoria_autenticacoes` for aplicado.
        const dados: Array<Record<string, unknown>> = [];

        // 4. Envelope final
        return {
            id: randomUUID(),
            tipo: dto.tipo,
            data_geracao: new Date().toISOString(),
            periodo:
                dto.data_inicio || dto.data_fim
                    ? {
                          data_inicio: dto.data_inicio ?? undefined,
                          data_fim: dto.data_fim ?? undefined,
                      }
                    : undefined,
            formato: dto.formato,
            total_registros: dados.length,
            dados,
            sumario,
        };
    },

    /**
     * Helper de sumarização: constroi o objeto `sumario` para cada tipo.
     *
     * Observação de implementação:
     *   O padrão `switch` é adequado aqui pois o conjunto de tipos é pequeno e
     *   fechado (`z.enum`). Quando a quantidade crescer (acima de 7 relatórios),
     *   substituir por Strategy Pattern (Map<TipoRelatorio, () => Sumario>) para
     *   cumprir o Princípio Aberto-Fechado (OCP — Bertrand Meyer, 1988).
     *
     * Cada branch retorna um objeto shape específico:
     *   - usuarios-*  : `{ total_usuarios: number, mensagem: string }`.
     *   - classificacao-usuarios: contagem por nível RBAC + total + mensagem.
     *   - acessos-recentes: contagem de autenticações (total, sucesso, falha) + mensagem.
     *
     * Em produção, as contagens vêm de queries COUNT(*) / GROUP BY, e o campo
     * `mensagem` pode ser omitido ou ser null.
     *
     * @param tipo - Qual tipo de relatório o sumário deve atender.
     * @returns      Record<string, unknown> tipado livremente (shape varia por tipo).
     */
    gerarSumario(tipo: GenerateReportDTO["tipo"]): Record<string, unknown> {
        switch (tipo) {
            case "usuarios-ativos":
            case "usuarios-inativos":
                return {
                    total_usuarios: 0,
                    mensagem: "Tabela de usuários ainda não criada no banco de dados.",
                };
            case "classificacao-usuarios":
                return {
                    sakai: 0,
                    admin: 0,
                    gestor: 0,
                    usuario: 0,
                    total: 0,
                    mensagem: "Tabela de usuários ainda não criada no banco de dados.",
                };
            case "acessos-recentes":
                return {
                    total_autenticacoes: 0,
                    autenticacoes_sucesso: 0,
                    autenticacoes_falha: 0,
                    mensagem: "Tabela de auditoria ainda não criada no banco de dados.",
                };
            default:
                return {};
        }
    },
};

/**
 * Exportação default (barrel pattern) para importações unificadas.
 */
export default relatoriosService;
