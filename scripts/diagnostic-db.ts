/**
 * Script de diagnóstico de conexão com PostgreSQL.
 *
 * Objetivo principal:
 * - verificar rapidamente se a configuração de conexão está correta;
 * - testar três estratégias diferentes de SSL/CA;
 * - indicar ao desenvolvedor o problema mais provável em caso de falha.
 *
 * O script é utilizado principalmente em ambientes de desenvolvimento e suporte,
 * ajudando a distinguir entre:
 * - credenciais incorretas;
 * - host/porta/DB bloqueados;
 * - certificado CA inválido;
 * - problema de rede ou firewall.
 */

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnv(name: string, defaultValue?: string): string | undefined {
    const value = process.env[name]?.trim();
    return value || defaultValue;
}

function getRequiredEnv(name: string): string {
    const value = getEnv(name);

    if (!value) {
        throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
    }

    return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    return value.trim().toLowerCase() === "true";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
    if (value === undefined) {
        return defaultValue;
    }

    const parsed = Number(value.trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function extrairCertificadosPem(entrada: string): string[] {
    if (!entrada) {
        return [];
    }

    const limpa = entrada.replace(/\r\n/g, "\n").trim();
    const delimitado = limpa
        .replace(/-----BEGIN CERTIFICATE-----/g, "\n-----BEGIN CERTIFICATE-----\n")
        .replace(/-----END CERTIFICATE-----/g, "\n-----END CERTIFICATE-----\n");

    const regex = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const matches = delimitado.match(regex);

    if (!matches || matches.length === 0) {
        return [];
    }

    return matches
        .map((certificado) =>
            certificado
                .split("\n")
                .map((linha) => linha.trim())
                .filter(Boolean)
                .join("\n")
        )
        .filter((certificado) => certificado.length > 50);
}

function buildSslConfig(): pg.ClientConfig["ssl"] {
    const sslEnabled = parseBoolean(
        getEnv("DATABASE_SSL") ?? getEnv("DB_SSL"),
        false
    );

    console.log("\n--- [DIAGNÓSTICO SSL] ---");
    console.log("DATABASE_SSL / DB_SSL habilitado?", sslEnabled);

    if (!sslEnabled) {
        return false;
    }

    const rejectUnauthorized = parseBoolean(
        getEnv("DATABASE_SSL_REJECT_UNAUTHORIZED") ??
            getEnv("DB_SSL_REJECT_UNAUTHORIZED"),
        true
    );

    console.log("rejectUnauthorized configurado?", rejectUnauthorized);

    if (!rejectUnauthorized) {
        console.log(
            "⚠️ SSL com rejectUnauthorized=false — modo de desenvolvimento aceita qualquer CA."
        );

        return { rejectUnauthorized: false };
    }

    let customCAs: string[] = [];

    const caPemInline = getEnv("DB_SSL_CA_PEM");
    console.log(
        "DB_SSL_CA_PEM inline fornecido?",
        Boolean(caPemInline),
        caPemInline ? `(tamanho: ${caPemInline.length} caracteres)` : ""
    );

    if (caPemInline && caPemInline.includes("BEGIN CERTIFICATE")) {
        const certificados = extrairCertificadosPem(caPemInline);

        console.log(
            "Certificados extraídos da variável inline:",
            certificados.length
        );

        customCAs = customCAs.concat(certificados);
    }

    const caPath = getEnv("DATABASE_CA_PATH");
    console.log("DATABASE_CA_PATH:", caPath ?? "(não definido)");

    if (caPath) {
        const resolvedPath = path.isAbsolute(caPath)
            ? caPath
            : path.resolve(__dirname, "..", caPath);

        console.log("Caminho resolvido:", resolvedPath);

        try {
            if (fs.existsSync(resolvedPath)) {
                const conteudo = fs.readFileSync(resolvedPath, "utf-8").trim();
                const certificados = extrairCertificadosPem(conteudo);

                console.log(
                    "Certificados extraídos do arquivo:",
                    certificados.length
                );

                customCAs = customCAs.concat(certificados);
            } else {
                console.log("Arquivo não encontrado no caminho resolvido.");
            }
        } catch (error) {
            console.log("Erro ao ler arquivo CA:", error);
        }
    }

    const systemRootCerts = Array.isArray(tls.rootCertificates)
        ? tls.rootCertificates
        : [];

    console.log(
        "Certificados da loja padrão do Node (tls.rootCertificates):",
        systemRootCerts.length
    );

    const todasCAs = customCAs.concat(systemRootCerts);

    console.log(
        "Total de CAs que serão utilizados na validação SSL:",
        todasCAs.length
    );

    if (todasCAs.length === 0) {
        return { rejectUnauthorized: true };
    }

    return {
        rejectUnauthorized: true,
        ca: todasCAs.join("\n"),
    };
}

function normalizeDatabaseUrl(url: string): string {
    return url
        .replace(/[?&]sslmode=require[^&]*/g, (_match, offset) => {
            return offset === url.indexOf("?") ? "?" : "";
        })
        .replace(/\?$/, "")
        .replace(/&&+/g, "&")
        .replace(/\?&/, "?");
}

function buildPoolConfig(): pg.PoolConfig {
    const databaseUrl = getEnv("DATABASE_URL");
    const poolMax = parseNumber(getEnv("DATABASE_POOL_MAX"), 10);
    const ssl = buildSslConfig();

    console.log("\n--- [DIAGNÓSTICO CONFIG POOL] ---");

    if (databaseUrl) {
        const normalizedUrl = normalizeDatabaseUrl(databaseUrl);
        const obscured = normalizedUrl.replace(
            /:\/\/([^/@]+)@/,
            "://***:***@"
        );

        console.log("Modo: DATABASE_URL");
        console.log("URI (ofuscada):", obscured);

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
    const password = process.env.DB_PASSWORD ? "**********" : "(VAZIO!)";

    console.log("Modo: parâmetros separados");
    console.log("  HOST    :", host);
    console.log("  PORT    :", port);
    console.log("  DATABASE:", database);
    console.log("  USER    :", user);
    console.log("  PASSWORD:", password);

    return {
        host,
        port,
        database,
        user,
        password: process.env.DB_PASSWORD,
        ssl,
        max: poolMax,
        min: 0,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
}

async function testarPool(
    poolConfig: pg.PoolConfig,
    rotulo: string
): Promise<{ ok: boolean; duracaoMs: number; erro?: unknown }> {
    const pool = new Pool(poolConfig);
    const inicio = Date.now();
    let client: pg.PoolClient | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutP = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Timeout de conexão: 15 segundos (${rotulo})`));
        }, 15000);
    });

    try {
        client = await Promise.race<pg.PoolClient>([
            pool.connect(),
            timeoutP,
        ]);

        await client.query("SELECT 1 AS health_check, current_database()");

        return {
            ok: true,
            duracaoMs: Date.now() - inicio,
        };
    } catch (error) {
        return {
            ok: false,
            duracaoMs: Date.now() - inicio,
            erro: error,
        };
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (client) {
            try {
                client.release();
            } catch {
                // Ignora erro ao devolver uma conexão já encerrada.
            }
        }

        try {
            await pool.end();
        } catch {
            // Ignora erro ao fechar uma pool já encerrada.
        }
    }
}

async function main(): Promise<void> {
    console.log("=".repeat(70));
    console.log("   DIAGNÓSTICO DE CONEXÃO POSTGRESQL (3 estratégias)");
    console.log("=".repeat(70));

    let poolConfigPadrao: pg.PoolConfig;

    try {
        poolConfigPadrao = buildPoolConfig();
    } catch (error) {
        console.error("\n❌ ERRO na configuração da pool:", error);
        process.exit(1);
    }

    console.log(
        "\n--- [ESTRATÉGIA 1/3] — CONFIG .env ATUAL (CAs customizadas + sistema) ---"
    );

    const r1 = await testarPool(poolConfigPadrao, "estratégia 1");

    if (r1.ok) {
        console.log(
            `✅ SUCESSO em ${r1.duracaoMs}ms — a configuração atual do .env já funciona!`
        );
        process.exit(0);
    }

    console.log(
        `❌ Falhou em ${r1.duracaoMs}ms. Erro:`,
        (r1.erro as Error).message
    );

    console.log(
        "\n--- [ESTRATÉGIA 2/3] — SOMENTE LOJA PADRÃO DO SISTEMA ---"
    );

    const systemRootCerts = Array.isArray(tls.rootCertificates)
        ? tls.rootCertificates
        : [];

    const cfg2: pg.PoolConfig = {
        ...poolConfigPadrao,
        ssl: {
            rejectUnauthorized: true,
            ca: systemRootCerts.join("\n"),
        },
    };

    const r2 = await testarPool(cfg2, "estratégia 2");

    if (r2.ok) {
        console.log(
            `✅ SUCESSO em ${r2.duracaoMs}ms — O CA inline (DB_SSL_CA_PEM) estava incorreto.`
        );
        console.log(
            "💡 AÇÃO RECOMENDADA: remova ou atualize DB_SSL_CA_PEM no arquivo .env."
        );
        process.exit(0);
    }

    console.log(
        `❌ Falhou em ${r2.duracaoMs}ms. Erro:`,
        (r2.erro as Error).message
    );

    console.log(
        "\n--- [ESTRATÉGIA 3/3] — MODO DESENVOLVIMENTO (rejectUnauthorized=false) ---"
    );

    const cfg3: pg.PoolConfig = {
        ...poolConfigPadrao,
        ssl: { rejectUnauthorized: false },
    };

    const r3 = await testarPool(cfg3, "estratégia 3");

    if (r3.ok) {
        console.log(
            `✅ CONEXÃO BÁSICA FUNCIONA em ${r3.duracaoMs}ms, sem validar a CA.`
        );
        console.log("\n📋 CONCLUSÃO:");
        console.log("   Rede, host, porta, usuário, senha e banco estão corretos.");
        console.log("   O problema está apenas na cadeia de certificados SSL/CA.");
        console.log("\n💡 SOLUÇÕES:");
        console.log(
            "   A) Produção: obtenha a CA correta no painel da Aiven e atualize DB_SSL_CA_PEM."
        );
        console.log(
            "   B) Desenvolvimento: use DB_SSL_REJECT_UNAUTHORIZED=false."
        );
        process.exit(0);
    }

    console.log(
        `❌ Falhou em ${r3.duracaoMs}ms. Erro:`,
        (r3.erro as Error).message
    );

    console.log("\n📋 CONCLUSÃO: falha mesmo sem validação de CA.");
    console.log("   - Endereço ou porta incorretos");
    console.log("   - Firewall ou whitelist de IP bloqueando a conexão");
    console.log("   - Usuário ou senha incorretos");
    console.log("   - Instância do banco indisponível");

    const codigo = (r3.erro as NodeJS.ErrnoException | undefined)?.code;

    if (codigo) {
        console.log("   Código:", codigo);

        switch (codigo) {
            case "ETIMEDOUT":
            case "ECONNREFUSED":
                console.log(
                    "   → Verifique a whitelist de IP, firewall, host e porta."
                );
                break;
            case "ENOTFOUND":
                console.log("   → O DNS falhou. Verifique DB_HOST.");
                break;
            case "28P01":
                console.log("   → Senha incorreta.");
                break;
            case "3D000":
                console.log("   → O banco de dados não existe.");
                break;
        }
    }

    process.exit(1);
}

void main();