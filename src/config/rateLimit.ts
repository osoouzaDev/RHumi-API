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

export const LOGIN_LOCK_BASE_MS = 5 * 60 * 1000; // 5 minutos
export const LOGIN_LOCK_MAX_MS = 60 * 60 * 1000; // 1 hora

export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 requisições por IP
    standardHeaders: true, // Retorna informações de limite no cabeçalho RateLimit
    legacyHeaders: false, // Desativa cabeçalhos legados
    message: {
        message: "Muitas requisições feitas a partir deste IP, por favor tente novamente mais tarde.",
    },
});

export const loginLimiter = rateLimit({
    windowMs: LOGIN_LOCK_BASE_MS, // 5 minutos
    max: 10, // Limite de 10 tentativas de login por IP
    standardHeaders: true, // Retorna informações de limite no cabeçalho RateLimit
    legacyHeaders: false, // Desativa cabeçalhos legados
    message: {
        message: "Muitas tentativas de login falharam, por favor tente novamente mais tarde.",
    },
});

export const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 20, // Limite de 20 tentativas de refresh por IP
    standardHeaders: true, // Retorna informações de limite no cabeçalho RateLimit
    legacyHeaders: false, // Desativa cabeçalhos legados
    message: {
        message: "Muitas tentativas de refresh falharam, por favor tente novamente mais tarde.",
    },
});

export const logoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Muitas tentativas de logout. Aguarde alguns minutos.",
    },
});
