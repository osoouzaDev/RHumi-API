/**
 * Rate Limit global de API, baseado em IP do cliente.
 *
 * Objetivo:
 *  - Mitigar ataques de força bruta em endpoints públicos (login, refresh)
 *    e limitar uso abusivo em geral.
 *  - É um limite GENÉRICO. Endpoints sensíveis (login) devem acrescentar
 *    limitadores próprios com janelas menores e contagem mais restrita.
 *
 * Implementação: `express-rate-limit` — usa `Map` em memória por padrão.
 * Para deploy em múltiplas instâncias (cluster / serverless), o ideal é
 * trocar o `store` por um compartilhado ex.: `rate-limit-redis`.
 */

import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({
    // Janela de 15 minutos (em ms).
    windowMs: 15 * 60 * 1000,
    // Máximo de 100 requisições permitidas POR IP dentro da janela.
    max: 100,
    // Expõe `X-RateLimit-*` em conformidade com RFC 7231.
    standardHeaders: true,
    // Não expõe os cabeçalhos legados `X-RateLimit-Limit` etc. (deprecated).
    legacyHeaders: false,
    // Resposta em JSON quando o limite é atingido.
    message: {
        status: 429,
        message: "Muitas requisições. Tente novamente mais tarde.",
    },
});
