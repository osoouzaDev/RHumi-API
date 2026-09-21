/**
 * Camada de Aplicação (Controller) do recurso "Relatórios".
 *
 * Responsabilidade orquestradora:
 *   - Receber requisições HTTP dos endpoints `/reports/disponiveis` (GET) e
 *     `/reports/generate` (POST).
 *   - Validar corpo do request via `validatedBody<GenerateReportDTO>()`
 *     (schema Zod em `dto.ts`).
 *   - Delegar a emissão para `relatoriosService`.
 *   - Negociar o formato de saída: JSON (envelope padronizado via `success<T>()`)
 *     ou CSV (serialização direta em RFC 4180 com Content-Disposition attachment).
 *
 * Observações sobre tratamento de erros:
 *   Ambos os handlers usam `try/catch` e `next(error)` para encaminhar ao
 *   error handler global. A service pode lançar:
 *      - AppError(400) "Tipo de relatório não suportado".
 *      - AppError(422) "Data início posterior a fim".
 *   O error handler monta a resposta apropriada.
 */

import type { Request, Response, NextFunction } from "express";
import { relatoriosService } from "./service.js";
import { success } from "../../shared/http/success.js";
import { validatedBody } from "../../middlewares/validate.js";
import type { GenerateReportDTO, Relatorio, RelatorioListagem } from "./dto.js";

/**
 * Fachada dos controllers de relatórios.
 */
export const reportsController = {
    /**
     * Handler: GET /reports/disponiveis — Discovery endpoint do catálogo.
     *
     * Objetivo: permitir que o frontend (ou qualquer cliente) descubra quais
     * relatórios estão disponíveis, com suas descrições e parâmetros aceitos.
     * É um endpoint "leve" (sem I/O no banco) e pode ser cacheado em CDN
     * com Cache-Control de longa duração (ex.: `max-age=3600`), pois o
     * catálogo não muda em runtime.
     *
     * Segurança: rota não autenticada é geralmente inofensiva, mas em contexto
     * empresarial pode-se adicionar `autenticar` middleware para evitar que
     * a estrutura de relatórios vaze para clientes anônimos. Hoje segue
     * pública para facilitar a integração inicial.
     *
     * @param _req - Objeto Express Request (não utilizado; prefixo `_` é convenção).
     * @param res  - Response 200 com envelope success contendo lista tipada.
     * @param next - Forward para error handler em caso de falha (improvável aqui).
     */
    async listarDisponiveis(
        _req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const relatorios = relatoriosService.listarDisponiveis();
            success<RelatorioListagem[]>(res, relatorios, 200);
        } catch (error) {
            next(error);
        }
    },

    /**
     * Handler: POST /reports/generate — Emissão de relatório.
     *
     * Autenticação: a rota correspondente em `routes/reports.ts` deve
     * encadear `autenticar` + `authAdmin` (apenas admin e sakai emitem
     * relatórios, por LGPD — vazamento de lista de usuários é incidente
     * grave de dados pessoais).
     *
     * Negociação de formato:
     *   O DTO `formato` seleciona a serialização:
     *
     *   (1) `formato === "json"` — resposta padrão via `success<Relatorio>()`.
     *       Content-Type: application/json. Status 200. Payload completo.
     *
     *   (2) `formato === "csv"` — serialização manual para RFC 4180.
     *       Cabeçalhos e corpo da resposta:
     *         Content-Type: text/csv; charset=utf-8
     *         Content-Disposition: attachment; filename=relatorio-<tipo>-<epoch>.csv
     *       O prefixo de anexo ("attachment") força o navegador a fazer
     *       download, ao invés de exibir o CSV inline.
     *
     * BUG FIX (antes):
     *   Versão original usava `Object.keys(relatorio.sumario)` para EXTRAIR
     *   os nomes de colunas do CSV. Essa abordagem é estruturalmente
     *   incorreta: `sumario` contém estatísticas AGREGADAS (ex.: total_usuarios,
     *   sakai, admin, mensagem), enquanto cada linha em `dados` possui as
     *   colunas da consulta (ex.: id, nome, login, email). O CSV resultante
     *   teria um cabeçalho com 3-5 colunas e linhas com 8+ valores → colunas
     *   desalinhadas e dados em colunas erradas na importação.
     *
     * Solução aplicada:
     *   Cabeçalhos CSV são extraídos da PRIMEIRA LINHA de `relatorio.dados`.
     *   Se `dados` estiver vazio (STUB atual), montamos apenas o cabeçalho
     *   com as chaves do `sumario` (fallback razoável quando não há linhas).
     *   Para cada valor em cada linha, aplicamos a regra de quoting RFC 4180:
     *     • strings recebem aspas duplas e "internas escapadas como "";
     *     • não-strings são convertidas via String() (números, null, etc.).
     *
     * @param req  - Request com body JSON validado por `generateReportSchema`.
     * @param res  - Response: 200 JSON ou 200 CSV attachment.
     * @param next - Forward para error handler.
     */
    async gerar(
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const dto = validatedBody<GenerateReportDTO>(req);
            const relatorio = await relatoriosService.gerar(dto);

            if (dto.formato === "csv") {
                // Cabeçalhos HTTP para download de arquivo
                res.setHeader("Content-Type", "text/csv; charset=utf-8");
                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename=relatorio-${relatorio.tipo}-${Date.now()}.csv`
                );

                // —— BUG FIX (cabeçalhos CSV) ——
                // Cabeçalhos corretos: colunas da LINHA DE DADOS (1a. linha).
                // Fallback (dados vazios): usar chaves do sumário como info estática.
                const colunas =
                    relatorio.dados.length > 0
                        ? Object.keys(relatorio.dados[0] ?? {})
                        : Object.keys(relatorio.sumario ?? {});
                const cabecalhos = colunas.join(",");

                // Serialização de cada linha com quoting RFC 4180
                const linhasDados = relatorio.dados.map((linha) =>
                    colunas
                        .map((coluna) => {
                            const valor = linha[coluna];
                            if (typeof valor === "string") {
                                // Regra RFC 4180 § 2.7: aspas duplas no campo são escapadas como ""
                                // e todo o campo é envolto em aspas.
                                return `"${valor.replace(/"/g, '""')}"`;
                            }
                            return String(valor);
                        })
                        .join(",")
                );

                // Linha final: \r\n (CRLF) conforme RFC 4180 § 2.1 & § 2.4
                const csv = [cabecalhos, ...linhasDados].join("\r\n");
                res.status(200).send(csv);
                return;
            }

            // Formato JSON default
            success<Relatorio>(res, relatorio, 200);
        } catch (error) {
            next(error);
        }
    },
};

/**
 * Exportação default do barrel.
 */
export default reportsController;
