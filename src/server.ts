/**
 * Bootstrap do servidor da aplicação.
 *
 * Este arquivo é o ponto de entrada da API em produção e no desenvolvimento.
 * Ele é responsável por:
 * - carregar variáveis de ambiente do dotenv;
 * - criar a instância da aplicação Express via `createApp()`;
 * - inicializar recursos críticos do banco;
 * - iniciar a escuta na porta configurada.
 *
 * A separação aqui é importante: `server.ts` não define rotas e regras de negócio,
 * apenas inicia o processo da app de forma segura e observável.
 */

import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { banco } from "./database/connection.js";

// Cria a aplicação a partir do módulo principal de configuração.
const app = createApp();

/**
 * Inicia o servidor e prepara os recursos essenciais antes de aceitar requisições.
 *
 * O método `inicializarTabelaSeguranca()` pode ser usado para criar ou validar
 * tabelas de segurança e regras críticas antes que a aplicação receba tráfego.
 */
async function startServer(): Promise<void> {
    // Garante que quaisquer estruturas mínimas de segurança estejam prontas.
    await banco.inicializarTabelaSeguranca();

    // Inicia o listener HTTP na porta definida nas variáveis de ambiente.
    app.listen(env.port, () => {
        console.log(`Servidor iniciado na porta ${env.port}`);
        console.log("Timezone:", Intl.DateTimeFormat().resolvedOptions().timeZone);
        console.log("Data Servidor:", new Date().toString());
    });
}

// Executa o bootstrap de forma assíncrona e registra falhas de inicialização.
void startServer().catch((error) => {
    console.error("Falha ao iniciar servidor com segurança reforçada.", error);
});

export default app;
