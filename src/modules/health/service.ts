/**
 * Serviço de Monitoramento de Saúde (Health Check) da API RHumi.
 *
 * Finalidade (contexto SRE / DevOps):
 *   Disponibiliza uma visão sintética do estado runtime do sistema para orquestradores
 *   (Kubernetes `livenessProbe` / `readinessProbe`, AWS ALB health checks,
 *   monitores externos como BetterStack ou StatusCake). O endpoint consome
 *   este serviço e responde HTTP 200 se tudo OK, 503 se algum subsistema crítico
 *   estiver degradado.
 *
 * Métricas coletadas (conforme RFC da Google sobre Monitoramento de Sistemas
 * Distribuídos — "Site Reliability Engineering", Beyer et al., cap. 6):
 *
 *   (A) Globais do processo Node.js:
 *       • `versao`         : versão do package.json (npm_package_version).
 *       • `ambiente`       : NODE_ENV (development / production / homolog).
 *       • `uptime_segundos`: há quanto tempo o processo está rodando (process.uptime()).
 *       • `memoria.*`      : heap e RSS em MB (process.memoryUsage()). Permite
 *                            detectar memory leaks (RSS crescendo monotonicamente).
 *       • `sistema.*`      : OS, arquitetura, CPUs e load average (1/5/15 min.).
 *                            Útil para correlacionar latência com CPU steal.
 *
 *   (B) Dependências externas (subsistemas):
 *       • `servicos.banco_dados`:
 *            - `status` : healthy | unhealthy.
 *            - `latencia_ms`: latência round-trip de `SELECT 1` (prova de vida).
 *
 * Classificação geral de status:
 *   • `status = "ok"`       → se TODOS os subsistemas críticos estiverem healthy.
 *   • `status = "degraded"` → se QUALQUER subsistema crítico estiver unhealthy.
 */

import os from "node:os";
import process from "node:process";
import { banco } from "../../database/connection.js";

/**
 * Estrutura de resposta do health check.
 *
 * Tipagem discriminada (literal types) em `status` e `servicos.banco_dados.status`:
 *   O uso de `"ok" | "degraded"` e `"healthy" | "unhealthy"` em vez de `string`
 *   habilita narrowing no TypeScript quando o consumidor ler a resposta —
 *   por exemplo: `if (status === "degraded") { ...acionar alerta }` funciona
 *   sem casts, pois o compilador sabe que só há dois valores possíveis.
 */
export interface HealthStatus {
    status: "ok" | "degraded";
    timestamp: string;
    versao: string;
    ambiente: string;
    uptime_segundos: number;
    memoria: {
        heap_usado_mb: number;
        heap_total_mb: number;
        rss_mb: number;
    };
    sistema: {
        plataforma: string;
        arquitetura: string;
        cpus: number;
        carga_media: number[];
    };
    servicos: {
        banco_dados: {
            status: "healthy" | "unhealthy";
            latencia_ms: number | null;
        };
    };
}

/**
 * Fachada singleton do serviço de saúde.
 */
export const healthService = {
    /**
     * Constrói o snapshot de saúde completo da aplicação.
     *
     * Pipeline de coleta:
     *
     *   1. Cronometrar latência do banco:
     *      • `inicio = performance.now()` → alta resolução (frações de ms).
     *      • Invocar `banco.testarConexao()` (SELECT 1).
     *        Observação: testarConexao() NÃO lança em cenário de falha; ele
     *        retorna `false` ou `true` (ver implementação em connection.ts).
     *        Mesmo assim, envolvemos em try/catch como defense in depth caso
     *        uma versão futura do método passe a lançar.
     *      • Calcular `latencia = fim - inicio`.
     *      • A latência só é registrada se `dbSaudavel === true`; em falha,
     *        o valor null é semanticamente mais correto que 0ms (falso saudável).
     *
     *   2. Coletar métricas do processo via módulos built-in `process` e `os`.
     *      Valores em bytes (memoryUsage) são convertidos para MB (÷ 1024²).
     *
     *   3. Regra de classificação:
     *      O banco de dados é o ÚNICO subsistema crítico monitorado hoje.
     *      Se ele estiver unhealthy → aplicação toda marcada degraded.
     *      Futuramente, adicionar `Object.values(servicos).every(s => s.status === "healthy")`
     *      quando houver mais dependências (ex.: Redis, serviços externos).
     *
     *   4. Montar e retornar o envelope `HealthStatus`.
     *
     * Observação sobre `carga_media`:
     *   Em sistemas Windows, `os.loadavg()` retorna [0,0,0] por limitação do
     *   SO. Em ambientes Linux (produção no Aiven), os valores refletem a carga
     *   real de run queue — monitoramento baseado nisso é válido.
     *
     * @returns Snapshot completo de saúde com timestamp atual.
     */
    async obterStatus(): Promise<HealthStatus> {
        const inicio = performance.now();
        let dbSaudavel = false;
        try {
            dbSaudavel = await banco.testarConexao();
        } catch {
            // Defense in depth: embora testarConexao() não lance hoje,
            // qualquer exceção é tratada como unhealthy.
            dbSaudavel = false;
        }
        const latencia = performance.now() - inicio;

        const memoria = process.memoryUsage();
        const servicosBd = {
            // "as const" faz TypeScript inferir literal em vez de `string` genérica
            status: dbSaudavel ? ("healthy" as const) : ("unhealthy" as const),
            latencia_ms: dbSaudavel ? Math.round(latencia) : null,
        };

        // Regra de agregação de status: hoje só depende do banco
        const statusGeral: HealthStatus["status"] =
            servicosBd.status === "healthy" ? "ok" : "degraded";

        return {
            status: statusGeral,
            timestamp: new Date().toISOString(),
            // npm_package_version só é definido quando rodamos via `npm run`
            // Fallback "0.0.0" para execução direta via tsx (ex.: debug no VS Code)
            versao: process.env.npm_package_version ?? "0.0.0",
            ambiente: process.env.NODE_ENV ?? "development",
            uptime_segundos: Math.floor(process.uptime()),
            memoria: {
                heap_usado_mb: Math.round(memoria.heapUsed / 1024 / 1024),
                heap_total_mb: Math.round(memoria.heapTotal / 1024 / 1024),
                rss_mb: Math.round(memoria.rss / 1024 / 1024),
            },
            sistema: {
                plataforma: os.platform(),
                arquitetura: os.arch(),
                cpus: os.cpus().length,
                carga_media: os.loadavg(),
            },
            servicos: {
                banco_dados: servicosBd,
            },
        };
    },
};

/**
 * Exportação default (compatibilidade barrel).
 */
export default healthService;
