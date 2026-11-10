/**
 * Configuração de logging estruturado com Pino.
 *
 * Justificativa:
 *  - Pino é o logger de maior throughput do ecossistema Node.js
 *    (benchmarks ~10x mais rápido que winston em JSON puro).
 *  - Em ambientes cloud (Aiven, Vercel, K8s), logs estruturados são ingeridos
 *    por ferramentas como Grafana, Datadog e ELK — daí o JSON puro em produção.
 *  - Em desenvolvimento, usamos `pino-pretty` para logs humanamente legíveis.
 */

import pino from "pino";

/**
 * Nível mínimo de log. Permite sobrescrita via `LOG_LEVEL` para debug
 * pontual sem deploy. Ordem Pino: trace < debug < info < warn < error < fatal.
 */
const level = process.env.LOG_LEVEL || "info";

/**
 * Transport condicional:
 *  - Produção: NENHUM transport; Pino escreve JSON linha a linha no stdout
 *    (alta performance, adequado a collectors).
 *  - Demais ambientes: `pino-pretty` com cores e horário local (SYS:standard).
 */
const transportConfig =
    process.env.NODE_ENV !== "production"
        ? {
              transport: {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "SYS:standard",
                  },
              } as const,
          }
        : {};

/**
 * Instância singleton do logger, para ser usada como `logger.info(...)`,
 * `logger.error({ err }, "mensagem")`, etc. por toda a aplicação.
 */
export const logger = pino({
    level,
    ...transportConfig,
});
