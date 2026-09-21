/**
 * Arquivo de definição de rotas públicas para o recurso "Health Check".
 *
 * Conceito de Router no Express:
 *   Um `Router` é uma mini-instância de aplicação, isolada e montável, usada
 *   para agrupar definições de rota por domínio ou módulo. Cada módulo da
 *   arquitetura RHumi tem seu próprio `*.router.ts` que é montado (app.use)
 *   na aplicação principal em `src/app.ts`. Isso respeita o SRP: o app.ts
 *   conhece os módulos, mas não os detalhes de cada rota.
 *
 * Particularidades do módulo Health:
 *
 *   • Duplicidade de caminhos (alias):
 *     O mesmo handler `healthController.status` é registrado para DUAS rotas:
 *       - `/health`       → root (legacy, para ferramentas de monitoramento
 *                           simples que esperam /health sem prefixo).
 *       - `/api/health`   → namespace padrão da API REST, alinhado com os
 *                           demais módulos (`/api/auth`, `/api/usuarios`, etc.).
 *     A duplicação não é reexecução de lógica — ambos apontam para o mesmo
 *     handler semântico, evitando que clientes tenham que reconfigurar quando
 *     uma organização prefira root vs /api.
 *
 *   • Ausência de autenticação:
 *     A rota health é propositalmente PÚBLICA (não encadeia `autenticarToken`).
 *     Orquestradores externos como Kubernetes, AWS ALB, BetterStack, StatusCake
 *     fazem polling periódico e não possuem JWT. Recomenda-se, no entanto,
 *     combinar com `globalLimiter` do `rateLimit.ts` para abuso de volume.
 *
 *   • Ordem de montagem no app:
 *     O healthRouter é o PRIMEIRO router montado em `app.use(healthRouter)`.
 *     Isso é intencional: se houver falha global em middlewares subsequentes
 *     (ex.: body parser quebrado), o health ainda responde, permitindo
 *     diagnóstico em ambientes degradados.
 */

import { Router } from "express";
import { healthController } from "../modules/health/controller.js";

/**
 * Instância do Router do Express para endpoints de monitoramento de saúde.
 */
export const healthRouter = Router();

/**
 * Rota: GET /health (raiz, sem prefixo /api).
 *
 * Destinatário típico: monitores externos (SaaS / uptime checkers legados).
 * Retorna HTTP 200 com envelope `success<HealthStatus>` se tudo saudável;
 * HTTP 503 se qualquer subsistema crítico (banco, futuramente outros) estiver unhealthy.
 */
healthRouter.get("/health", healthController.status);

/**
 * Rota: GET /api/health (namespace padrão da API).
 *
 * Destinatário típico: frontend dashboard (integração dentro de /api/*).
 * Handler idêntico ao anterior; diferença apenas no path para alinhamento
 * com as demais rotas do sistema (REST namespace convention).
 */
healthRouter.get("/api/health", healthController.status);

/**
 * Exportação default (padrão barrel de rotas) para `app.use(healthRouter)` em app.ts.
 */
export default healthRouter;
