/**
 * Camada de Aplicação (Controller) do recurso "Health Check".
 *
 * Propriedades não-funcionais do endpoint:
 *
 *   • Autenticação: PÚBLICO (rota não protegida por `autenticar`).
 *     Orquestradores externos (ALB, K8s, monitoring) precisam acessar sem
 *     credenciais. Nunca retornar dados sensíveis (segredos, dsn do banco)
 *     neste endpoint — apenas métricas de sanidade e perfis.
 *
 *   • HTTP Status Semântico (conforme Kubernetes best practices):
 *     - 200 OK            → status === "ok", todos subsistemas healthy.
 *     - 503 Service Unavailable → status === "degraded" (banco unhealthy).
 *       O código 503 (e não 500) é importante: Kubernetes remove o Pod do
 *       Service load balancer em readinessProbe, mas NÃO reinicia o Pod
 *       (livenessProbe). Assim, um banco com timeout transitório não causa
 *       CrashLoopBackOff — esperado.
 *
 *   • Cache-Control:
 *     Recomenda-se adicionar `Cache-Control: no-cache, no-store` futuramente
 *     no route ou no middleware para evitar que proxies intermediários
 *     devolvam um health check "stale" de minutos atrás.
 */

import type { Request, Response, NextFunction } from "express";
import { healthService, type HealthStatus } from "./service.js";
import { success } from "../../shared/http/success.js";

/**
 * Fachada de controllers do health check.
 */
export const healthController = {
    /**
     * Handler: GET /health e GET /api/health — verificar sanidade da API.
     *
     * Fluxo:
     *   1. Invoca `healthService.obterStatus()` (async pois faz SELECT 1).
     *   2. Decide código HTTP: "ok" → 200, "degraded" → 503.
     *      (RFC 9110 § 15.6.4: 503 = serviço indisponível no momento, esperado).
     *   3. Escreve envelope `success<HealthStatus>()` — mesmo que seja 503.
     *      Usar envelope JSON em falha (e não HTML padrão do Express) é
     *      importante para clients programáticos (monitores lerem a propriedade
     *      `.data.status` para saber qual subsistema caiu).
     *
     * Observação: se o próprio `obterStatus()` lançar algo, o catch envia para
     * `errorHandler` global, que montará um JSON de erro — ainda assim melhor
     * que HTML 500 padrão para monitores.
     *
     * @param _req - Request (não usado: health é read-only sem auth).
     * @param res  - Response com envelope status code + JSON.
     * @param next - Forward para error handler.
     */
    async status(
        _req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> {
        try {
            const status = await healthService.obterStatus();
            const codigoHttp = status.status === "ok" ? 200 : 503;
            success<HealthStatus>(res, status, codigoHttp);
        } catch (error) {
            next(error);
        }
    },
};

/**
 * Exportação default barrel.
 */
export default healthController;
