import { Readable } from "node:stream";
import { google } from "googleapis";
import { AppError } from "../../shared/errors/app-error.js";

const drivePrefix = "drive:";

export function googleDriveEnabled(): boolean {
    return Boolean(
        process.env.GOOGLE_DRIVE_TRAINING_FOLDER_ID?.trim()
        && process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim()
        && process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim()
        && process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN?.trim(),
    );
}

export function isGoogleDriveReference(reference: string): boolean {
    return reference.startsWith(drivePrefix);
}

export function googleDriveFileId(reference: string): string {
    return reference.slice(drivePrefix.length);
}

function authFromEnvironment() {
    const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET?.trim();
    const refreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN?.trim();

    if (!clientId || !clientSecret || !refreshToken) {
        throw new AppError("A integração OAuth do Google Drive não está configurada.", 503);
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
}

function driveClient() {
    const folderId = process.env.GOOGLE_DRIVE_TRAINING_FOLDER_ID?.trim();
    if (!folderId) {
        throw new AppError("A pasta de PDFs no Google Drive não foi configurada.", 503);
    }
    return { folderId, drive: google.drive({ version: "v3", auth: authFromEnvironment() }) };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export async function uploadTrainingPdf(buffer: Buffer, fileName: string): Promise<string> {
    const { folderId, drive } = driveClient();
    try {
        const result = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: "application/pdf",
                parents: [folderId],
            },
            media: {
                mimeType: "application/pdf",
                body: Readable.from(buffer),
            },
            fields: "id",
            supportsAllDrives: true,
        });
        if (!result.data.id) {
            throw new AppError("O Google Drive não retornou o identificador do PDF.", 502);
        }
        return `${drivePrefix}${result.data.id}`;
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError("Não foi possível enviar o PDF para o Google Drive.", 502);
    }
}

export async function downloadTrainingPdf(reference: string): Promise<Buffer> {
    const { drive } = driveClient();
    try {
        const result = await drive.files.get({
            fileId: googleDriveFileId(reference),
            alt: "media",
            supportsAllDrives: true,
        }, { responseType: "stream" });

        return await streamToBuffer(result.data);
    } catch (error) {
        if (error instanceof AppError) throw error;
        const status = (error as { code?: number; response?: { status?: number } })?.response?.status
            ?? (error as { code?: number })?.code;
        if (status === 404) {
            throw new AppError("O PDF não está disponível no Google Drive.", 404);
        }
        throw new AppError("Não foi possível baixar o PDF do Google Drive.", 502);
    }
}

export async function deleteTrainingPdf(reference: string): Promise<void> {
    if (!isGoogleDriveReference(reference)) return;
    const { drive } = driveClient();
    try {
        await drive.files.delete({
            fileId: googleDriveFileId(reference),
            supportsAllDrives: true,
        });
    } catch (error) {
        const code = (error as { code?: number })?.code;
        if (code !== 404) {
            throw new AppError("Não foi possível remover o PDF do Google Drive.", 502);
        }
    }
}
