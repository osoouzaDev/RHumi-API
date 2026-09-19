import "dotenv/config";
import { createApp } from "./app";
import { env } from "./config/env";

cosnt app = createApp();

async function startServer(): Promise<void> {
    await banco.inicializarTabelaSeguranca();

    app.listen(env.port, () => {
        console.log(`Servidor iniciado na porta ${env.port}`);
        console.log("Timezone:", Intl.DateTimeFormat().resolvedOptions().timeZone);
        console.log("Data Servidor:", new Date().toString());
    });
}

void startServer().catch((error) => {
    console.error("Falha ao inciar seridor com segurança reforçada.", error);
});

export default app; 