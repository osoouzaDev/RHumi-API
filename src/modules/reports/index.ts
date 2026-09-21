/**
 * Arquivo Barrel (Barrel File) do módulo `reports`.
 *
 * Objetivo: agregar em um único ponto de importação os símbolos públicos do
 * submódulo reports (schemas, tipos, interfaces).
 *
 * Ordem de exportação (convenção local):
 *   1. VALORES (schemas Zod, enum, constantes) → usados em runtime.
 *   2. TIPOS (DTOs, interfaces) → usados só em compilação TypeScript.
 *
 * Assim como os demais barrels da aplicação, garante Information Hiding:
 * consumidores externos importam de `../reports` sem conhecer a estrutura
 * interna dto/service/controller.
 */

// Valores (entidades em runtime): schema Zod, enum, catálogo constante
export { generateReportSchema, tipoRelatorioEnum, RELATORIOS_DISPONIVEIS } from "./dto.js";
// Tipos (apenas TypeScript): DTOs, interfaces de domínio
export type { GenerateReportDTO, TipoRelatorio, Relatorio, RelatorioListagem } from "./dto.js";
