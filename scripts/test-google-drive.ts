import "dotenv/config";
import { Readable } from "node:stream";
import { google } from "googleapis";

async function main(): Promise<void> {
    const folderId = process.env.GOOGLE_DRIVE_TRAINING_FOLDER_ID?.trim();
    const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN?.trim();

    if (!folderId) throw new Error("GOOGLE_DRIVE_TRAINING_FOLDER_ID não está configurada.");
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Configure as três variáveis OAuth do Google Drive.");
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    const drive = google.drive({ version: "v3", auth });

    const folder = await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,driveId",
        supportsAllDrives: true,
    });

    if (folder.data.mimeType !== "application/vnd.google-apps.folder") {
        throw new Error("O ID informado não corresponde a uma pasta do Google Drive.");
    }

    const created = await drive.files.create({
        requestBody: {
            name: `rhumi-integracao-teste-${Date.now()}.pdf`,
            mimeType: "application/pdf",
            parents: [folderId],
        },
        media: {
            mimeType: "application/pdf",
            body: Readable.from(Buffer.from("%PDF-1.4\nRHumi integration test\n%%EOF")),
        },
        fields: "id,name",
        supportsAllDrives: true,
    });

    await drive.files.delete({
        fileId: created.data.id,
        supportsAllDrives: true,
    });

    console.log(`Pasta: ${folder.data.name}`);
    console.log("Upload e exclusão temporária concluídos.");
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Falha no teste do Google Drive: ${message}`);
    process.exitCode = 1;
});
