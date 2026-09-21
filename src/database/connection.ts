/**
 * Camada de persistência — Pool de conexões PostgreSQL via `pg` (node-postgres).
 *
 * Objetivos:
 *   1. Centralizar toda a configuração e gerenciamento de conexões com o BD
 *      em um ÚNICO arquivo — evita múltiplas pools instanciadas por engano.
 *   2. Implementar uma estratégia resiliente de SSL/TLS que funciona tanto
 *      em desenvolvimento (CA privada Aiven, self-signed) quanto em produção
 *      (CAs públicas Mozilla).
 *   3. Exportar uma fachada (`banco`) com interface estável para o resto da
 *      aplicação, de modo que mudanças no driver ou migração para outro SGBD
 *      fiquem restritas a este arquivo.
 *
 * Funcionamento da Pool:
 *   - `max`  : número máximo de conexões simultâneas (default 10).
 *   - `min=0`: ocioso, nenhuma conexão mantida permanentemente aberta.
 *   - `idleTimeoutMillis=30000` : conexão ociosa por +30s é fechada.
 *   - `connectionTimeoutMillis=10000` : timeout ao obter conexão da pool.
 */

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

/**
 * Resolve `__dirname` em módulos ESM (`import`). Sem CommonJS, a variável
 * `__dirname` não existe nativamente; precisamos derivá-la de `import.meta.url`.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* --------------------------------------------------------------------------
 * Helpers de leitura / coerção de variáveis de ambiente
 * -------------------------------------------------------------------------- */

/**
 * Retorna o valor da variável (com `trim()`) ou `defaultValue` se vazia.
 * Diferente de `getRequiredEnv`, NÃO lança erro — usado para opcionais.
 */
function getEnv(name: string, defaultValue?: string): string | undefined {
    const value = process.env[name]?.trim();
    return value || defaultValue;
}

/**
 * Retorna o valor da variável ou lança erro — usado para campos obrigatórios
 * sem os quais a conexão com o BD não pode ser feita (host, db, user, etc.).
 */
function getRequiredEnv(name: string): string {
    const value = getEnv(name);
    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
    }
    return value;
}

/**
 * Interpreta `true/TRUE/True` como booleano. Qualquer outro valor (incluindo
 * `undefined`) retorna `defaultValue`. Evita confusão com string vazia.
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) return defaultValue;
    return value.trim().toLowerCase() === "true";
}

/**
 * Converte uma string para número estrito (> 0). Usada para PORT, MAX, etc.
 * `parseInt` não serve pois ele retorna NaN ao encontrar texto.
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
    if (value === undefined) return defaultValue;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

/* --------------------------------------------------------------------------
 * Configuração SSL / TLS
 * -------------------------------------------------------------------------- */

/**
 * Extrai um ou múltiplos certificados PEM concatenados de um texto arbitrário.
 *
 * Motivação:
 *   - Um arquivo `ca-bundle.crt` ou uma variável inline pode conter múltiplos
 *     certificados colados um após o outro. Extraímos um por um usando regex
 *     não-guloso `[\s\S]*?` para não englobar múltiplos BEGIN/END.
 *
 * @returns Array de PEMs individuais, formatados e limpos (sem \r, sem linhas vazias).
 */
function extrairCertificadosPem(entrada: string): Array<string> {
    if (!entrada) return [];
    const limpa = entrada.replace(/\r\n/g, "\n").trim();

    // Garante que delimitadores `-----BEGIN...-----` fiquem em linhas próprias
    // (alguns .env colam `...-----BEGIN` tudo em uma única linha).
    const delimitado = limpa
        .replace(/-----BEGIN CERTIFICATE-----/g, "\n-----BEGIN CERTIFICATE-----\n")
        .replace(/-----END CERTIFICATE-----/g, "\n-----END CERTIFICATE-----\n");

    const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const matches = delimitado.match(regex);

    if (!matches || matches.length === 0) {
        return [];
    }

    return matches
        .map((cert) =>
            cert
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .join("\n")
        )
        .filter((cert) => cert.length > 50);
}

/**
 * Constrói a configuração `ssl` para o `node-postgres`.
 *
 * Estratégia de confiança em ordem de preferência:
 *
 *   1. `DB_SSL_REJECT_UNAUTHORIZED=false` → modo desenvolvimento:
 *      conexão criptografada mas sem validar a CA. Aceita self-signed.
 *
 *   2. Caso `true` (padrão), montamos um conjunto de CAs CONCATENADAS:
 *      a) CAs fornecidas via variável inline `DB_SSL_CA_PEM` (projeto Aiven).
 *      b) CAs fornecidas via arquivo `DATABASE_CA_PATH`.
 *      c) **Sempre anexamos as 120+ CAs públicas da loja Mozilla
 *         (`tls.rootCertificates` do Node)**.
 *
 * Anteriormente, passava SOMENTE a CA inline, o que fazia o Node **ignorar
 * as CAs do sistema**. Isso gerava `SELF_SIGNED_CERT_IN_CHAIN` sempre que
 * a CA inline estivesse desatualizada. A estratégia atual concatena as
 * listas, funcionando em qualquer cenário.
 */
function buildSslConfig(): pg.ClientConfig["ssl"] {
    const sslEnabled = parseBoolean(
        getEnv("DATABASE_SSL") ?? getEnv("DB_SSL"),
        false
    );

    if (!sslEnabled) {
        return false;
    }

    const rejectUnauthorized = parseBoolean(
        getEnv("DATABASE_SSL_REJECT_UNAUTHORIZED") ?? getEnv("DB_SSL_REJECT_UNAUTHORIZED"),
        true
    );

    if (!rejectUnauthorized) {
        return { rejectUnauthorized: false };
    }

    let customCAs: Array<string> = [];

    // Estratégia A): PEM colado em uma única linha (DB_SSL_CA_PEM).
    const caPemInline = getEnv("DB_SSL_CA_PEM");
    if (caPemInline && caPemInline.includes("BEGIN CERTIFICATE")) {
        const certificados = extrairCertificadosPem(caPemInline);
        if (certificados.length > 0) {
            customCAs = customCAs.concat(certificados);
        }
    }

    // Estratégia B): arquivo .pem no sistema de arquivos.
    const caPath = getEnv("DATABASE_CA_PATH");
    if (caPath) {
        const resolvedPath = path.isAbsolute(caPath)
            ? caPath
            : path.resolve(__dirname, "..", "..", caPath);
        try {
            if (fs.existsSync(resolvedPath)) {
                const conteudo = fs.readFileSync(resolvedPath, "utf-8").trim();
                const certificados = extrairCertificadosPem(conteudo);
                if (certificados.length > 0) {
                    customCAs = customCAs.concat(certificados);
                }
            }
        } catch {
            // ignore erro de leitura — seguimos sem as CAs do arquivo.
        }
    }

    // Estratégia C): concatena CAs públicas padrão Mozilla (Node.js built-in).
    const systemRootCerts = Array.isArray(tls.rootCertificates)
        ? tls.rootCertificates
        : [];

    const todasCAs = customCAs.concat(systemRootCerts);

    if (todasCAs.length === 0) {
        return { rejectUnauthorized: true };
    }

    return {
        rejectUnauthorized: true,
        ca: todasCAs.join("\n"),
    };
}

/* --------------------------------------------------------------------------
 * Montagem da configuração final da Pool
 * -------------------------------------------------------------------------- */

/**
 * Remove o parâmetro `sslmode=require` da connection string caso presente,
 * pois já tratamos SSL explicitamente via propriedade `ssl` da pool.
 * Evita duplicação e warnings do driver.
 */
function normalizeDatabaseUrl(url: string): string {
    return url.replace(/[?&]sslmode=require[^&]*/g, (match, offset) => {
        return offset === url.indexOf("?") ? "?" : "";
    }).replace(/\?$/, "").replace(/&&+/g, "&").replace(/\?&/, "?");
}

/**
 * Monta a pool em um dos dois formatos suportados:
 *   - Modo `DATABASE_URL`: URI completa (ex.: serviços gerenciados).
 *   - Modo parâmetros separados: `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD`.
 *
 * A variável `DATABASE_URL` tem maior precedência quando ambas estão presentes.
 */
function buildPoolConfig(): pg.PoolConfig {
    const databaseUrl = getEnv("DATABASE_URL");
    const poolMax = parseNumber(getEnv("DATABASE_POOL_MAX"), 10);
    const ssl = buildSslConfig();

    if (databaseUrl) {
        const normalizedUrl = normalizeDatabaseUrl(databaseUrl);
        return {
            connectionString: normalizedUrl,
            ssl,
            max: poolMax,
            min: 0,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };
    }

    const host = getRequiredEnv("DB_HOST");
    const port = parseNumber(getEnv("DB_PORT"), 5432);
    const database = getRequiredEnv("DB_NAME");
    const user = getRequiredEnv("DB_USER");
    const password = getRequiredEnv("DB_PASSWORD");

    return {
        host,
        port,
        database,
        user,
        password,
        ssl,
        max: poolMax,
        min: 0,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
}

/* --------------------------------------------------------------------------
 * Instanciação única da pool + listeners de ciclo de vida
 * -------------------------------------------------------------------------- */

const poolConfig = buildPoolConfig();
const pool = new Pool(poolConfig);

/**
 * Erro assíncrono em uma conexão idle (ex.: PostgreSQL reiniciou, rede caiu).
 * Sem este listener, o Node joga o erro em `unhandledException` e mata o
 * processo — este handler permite que a pool se recupere automaticamente.
 */
pool.on("error", (err) => {
    console.error("[PostgreSQL] Erro inesperado no cliente da pool:", err);
});

pool.on("acquire", () => {
    if (process.env.NODE_ENV === "development") {
        console.debug(
            "[PostgreSQL] Conexão adquirida da pool. Total ativa:",
            pool.totalCount,
            "| Ociosa:",
            pool.idleCount,
            "| Aguardando:",
            pool.waitingCount
        );
    }
});

pool.on("release", () => {
    if (process.env.NODE_ENV === "development") {
        console.debug(
            "[PostgreSQL] Conexão devolvida à pool. Total ativa:",
            pool.totalCount,
            "| Ociosa:",
            pool.idleCount,
            "| Aguardando:",
            pool.waitingCount
        );
    }
});

/* --------------------------------------------------------------------------
 * API Pública
 * -------------------------------------------------------------------------- */

/**
 * Tipagem do retorno de uma consulta. Padroniza `rows` e `rowCount` do driver.
 * `Record<string, unknown>` é intencionalmente genérico; cada repository
 * faz o cast tipado adequado.
 */
export interface DatabaseQueryResult {
    rows: Array<Record<string, unknown>>;
    rowCount: number;
}

/**
 * Executa uma consulta parametrizada ($1, $2, …) utilizando uma conexão
 * da pool e devolve-a automaticamente após o término.
 *
 * @param text   Consulta SQL com placeholders `$1`, `$2`… (nunca concatene!).
 * @param params Valores na mesma ordem dos placeholders.
 */
export async function query(
    text: string,
    params?: Array<unknown>
): Promise<DatabaseQueryResult> {
    const result = await pool.query(text, params);
    return {
        rows: result.rows as Array<Record<string, unknown>>,
        rowCount: result.rowCount ?? 0,
    };
}

/**
 * Aluga uma conexão da pool para uso manual (ex.: transações BEGIN/COMMIT/ROLLBACK).
 * O chamador É OBRIGADO a invocar `.release()` no cliente após o uso, caso
 * contrário a conexão ficará "perdida" na pool até estourar o `idleTimeout`.
 *
 * Exemplo:
 *   const client = await banco.getClient();
 *   try {
 *     await client.query("BEGIN");
 *     ...
 *     await client.query("COMMIT");
 *   } catch (e) {
 *     await client.query("ROLLBACK");
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient(): Promise<pg.PoolClient> {
    return await pool.connect();
}

/**
 * Health check da camada de persistência — executa `SELECT 1` e mede sucesso.
 * Usado por `/health` e pelo startup para sinalizar readiness.
 */
export async function testarConexao(): Promise<boolean> {
    let client: pg.PoolClient | null = null;
    try {
        client = await pool.connect();
        await client.query("SELECT 1 AS health_check");
        console.log("[PostgreSQL] Conexão com o banco de dados estabelecida com sucesso.");
        return true;
    } catch (error) {
        console.error("[PostgreSQL] Falha ao conectar ao banco de dados:", error);
        return false;
    } finally {
        if (client) {
            client.release();
        }
    }
}

/**
 * Encerramento gracioso da pool. Chamado no handler de `SIGTERM` (Kubernetes,
 * Docker) e `SIGINT` (Ctrl+C) para evitar vazamento de conexões.
 */
export async function encerrarPool(): Promise<void> {
    await pool.end();
    console.log("[PostgreSQL] Pool de conexões encerrada.");
}

/**
 * Fachada de acesso a dados — usada por toda a aplicação.
 *
 * Mantém 2 stubs (`tokenRevogado` e `inicializarTabelaSeguranca`) que serão
 * implementados quando as tabelas auxiliares forem criadas no PostgreSQL.
 * Manter estas funções aqui reduz mudanças em middlewares/routes quando o
 * schema estiver pronto.
 */
export const banco = {
    query,
    getClient,
    testarConexao,
    encerrarPool,

    /**
     * Verifica blacklist de tokens (JTI). Implementação atual é um no-op
     * (sempre retorna falso) até a tabela existir.
     */
    async tokenRevogado(_jti: string): Promise<boolean> {
        return false;
    },

    /**
     * Placeholder para migrações iniciais (criação de tabelas de segurança
     * se elas não existirem). Hoje apenas loga.
     */
    async inicializarTabelaSeguranca(): Promise<void> {
        console.log(
            "[PostgreSQL] inicializarTabelaSeguranca() invocado - migrações ainda não implementadas."
        );
    },

    /**
     * Acesso direto à instância `pg.Pool` — uso exclusivo de implementação
     * interna (ex.: debug avançado). Evite usar fora deste módulo.
     */
    pool,
};

export default pool;
