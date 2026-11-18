import "dotenv/config";
import { createServer } from "node:http";
import { google } from "googleapis";

async function waitForAuthorizationCode(redirectUri: string): Promise<string> {
    const redirect = new URL(redirectUri);
    const port = Number(redirect.port || "80");

    return new Promise((resolve, reject) => {
        const server = createServer((request, response) => {
            const requestUrl = new URL(request.url || "/", redirect.origin);
            if (requestUrl.pathname !== redirect.pathname) {
                response.writeHead(404).end("Not found");
                return;
            }

            const error = requestUrl.searchParams.get("error");
            const code = requestUrl.searchParams.get("code");
            if (error) {
                response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
                response.end(`A autorização foi recusada: ${error}`);
                server.close();
                reject(new Error(`A autorização foi recusada: ${error}`));
                return;
            }
            if (!code) {
                response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
                response.end("O código de autorização não foi recebido.");
                return;
            }

            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end("<h1>Autorizacao concluida</h1><p>Voce pode fechar esta janela.</p>");
            server.close();
            resolve(code);
        });

        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
            console.log(`Aguardando o callback em ${redirectUri}`);
        });
    });
}

async function main(): Promise<void> {
    const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim()
        || "http://localhost:3001/oauth2/callback";

    if (!clientId || !clientSecret) {
        throw new Error(
            "Configure GOOGLE_DRIVE_OAUTH_CLIENT_ID e GOOGLE_DRIVE_OAUTH_CLIENT_SECRET.",
        );
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const authorizationUrl = oauth2.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/drive"],
    });

    console.log("Abra este endereço no navegador:");
    console.log(authorizationUrl);

    const code = await waitForAuthorizationCode(redirectUri);
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error(
            "O Google não retornou refresh token. Revogue o acesso anterior e execute novamente.",
        );
    }

    console.log("Adicione esta variável ao arquivo de ambiente:");
    console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Falha na autorização: ${message}`);
    process.exitCode = 1;
});
