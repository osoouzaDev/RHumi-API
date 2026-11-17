import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.js";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { AppError } from "../../shared/errors/app-error.js";
import { success } from "../../shared/http/success.js";
import { saveLearningItemSchema, type SaveLearningItemDTO, type SubmitAssessmentDTO } from "./dto.js";
import { learningRepository } from "./repository.js";

const pdfLimitBytes = 10 * 1024 * 1024;
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: pdfLimitBytes, files: 1, fields: 8, parts: 9, fieldSize: 2 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
        if (file.mimetype !== "application/pdf") {
            callback(new AppError("O anexo precisa ser um arquivo PDF.", 415));
            return;
        }
        callback(null, true);
    },
});

export const uploadPdf: RequestHandler = (req, res, next) => {
    upload.single("pdf")(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            next(new AppError("O PDF deve ter no máximo 10 MiB.", 413));
            return;
        }
        if (error instanceof multer.MulterError) {
            next(new AppError("O formulário excedeu os limites permitidos.", 413));
            return;
        }
        next(error);
    });
};

function storageDirectory(): string {
    return path.resolve(
        process.env.TRAINING_PDF_DIR?.trim() || path.join(process.cwd(), "storage", "training-pdfs"),
    );
}

function requester(req: Request): AuthRequest["user"] {
    return (req as AuthRequest).user;
}

function requireUser(req: Request): NonNullable<AuthRequest["user"]> {
    const user = requester(req);
    if (!user?.id) throw new AppError("Usuário não autenticado.", 401);
    return user;
}

function parseJsonField(value: unknown, field: string): unknown {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new AppError(`O campo ${field} contém dados inválidos.`, 400);
    }
}

function parseItemBody(body: unknown): SaveLearningItemDTO {
    if (!body || typeof body !== "object") {
        throw new AppError("Informe os dados do conteúdo.", 400);
    }
    const fields = body as Record<string, unknown>;
    const questions = parseJsonField(fields["perguntas"], "perguntas");
    const proof = parseJsonField(fields["prova"], "prova");
    const parsed = saveLearningItemSchema.safeParse({
        ...fields,
        descricao: fields["descricao"] === "" ? null : fields["descricao"],
        tipo_material: fields["tipo_material"] === "" ? null : fields["tipo_material"],
        url_material: fields["url_material"] === "" ? null : fields["url_material"],
        setores: parseJsonField(fields["setores"], "setores"),
        perguntas: fields["tipo"] === "AVALIACAO" ? questions : undefined,
        prova: fields["tipo"] === "TREINAMENTO" ? proof : undefined,
        ativo: fields["ativo"] === "true" || fields["ativo"] === true,
    });
    if (!parsed.success) {
        throw new AppError(parsed.error.issues.map((issue) => issue.message).join(" "), 422);
    }
    return parsed.data;
}

async function savePdf(file: Express.Multer.File | undefined): Promise<string | null> {
    if (!file) return null;
    if (!file.buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
        throw new AppError("O arquivo selecionado não contém um PDF válido.", 415);
    }
    const directory = storageDirectory();
    await mkdir(directory, { recursive: true });
    const name = `${randomUUID()}.pdf`;
    await writeFile(path.join(directory, name), file.buffer, { flag: "wx" });
    return name;
}

async function removePdf(name: string | null): Promise<void> {
    if (!name) return;
    await unlink(path.join(storageDirectory(), name)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
    });
}

function assertEmployee(user: NonNullable<AuthRequest["user"]>): void {
    if (user.classificacao.trim().toUpperCase() !== "EMPLOYEE") {
        throw new AppError("Somente colaboradores podem realizar avaliações.", 403);
    }
}

export const learningController = {
    async listar(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = requireUser(req);
            success(res, await learningRepository.listar(user.id, user.classificacao));
        } catch (error) {
            next(error);
        }
    },

    async criar(req: Request, res: Response, next: NextFunction): Promise<void> {
        let savedPdf: string | null = null;
        try {
            const data = parseItemBody(req.body);
            if (req.file && (data.tipo !== "TREINAMENTO" || data.tipo_material !== "PDF" || data.url_material)) {
                throw new AppError("Anexe um PDF somente a um treinamento configurado como PDF e sem URL.", 400);
            }
            savedPdf = await savePdf(req.file);
            const item = await learningRepository.criar(data, savedPdf);
            savedPdf = null;
            success(res, item, 201);
        } catch (error) {
            await removePdf(savedPdf);
            next(error);
        }
    },

    async atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
        let savedPdf: string | null = null;
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const data = parseItemBody(req.body);
            if (req.file && (data.tipo !== "TREINAMENTO" || data.tipo_material !== "PDF" || data.url_material)) {
                throw new AppError("Anexe um PDF somente a um treinamento configurado como PDF e sem URL.", 400);
            }
            const oldPdf = await learningRepository.buscarArquivoPdf(id);
            savedPdf = await savePdf(req.file);
            const item = await learningRepository.atualizar(id, data, savedPdf);
            savedPdf = null;
            const currentPdf = await learningRepository.buscarArquivoPdf(id);
            if (oldPdf && oldPdf !== currentPdf) await removePdf(oldPdf);
            success(res, item);
        } catch (error) {
            await removePdf(savedPdf);
            next(error);
        }
    },

    async atualizarStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const body = validatedBody<{ ativo: boolean }>(req);
            if (typeof body.ativo !== "boolean") {
                throw new AppError("Informe se o conteúdo ficará ativo.", 400);
            }
            success(res, await learningRepository.atualizarStatus(id, body.ativo));
        } catch (error) {
            next(error);
        }
    },

    async excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const body = validatedBody<{ apagar_resultados: boolean }>(req);
            const deleted = await learningRepository.excluir(id, body.apagar_resultados);
            await removePdf(deleted.arquivo_pdf);
            success(res, { excluido: true });
        } catch (error) {
            next(error);
        }
    },

    async listarResultados(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            success(res, await learningRepository.listarResultados(id));
        } catch (error) {
            next(error);
        }
    },

    async listarDesempenho(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await learningRepository.listarDesempenho());
        } catch (error) {
            next(error);
        }
    },

    async visualizarPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = requireUser(req);
            const { id } = validatedParams<{ id: string }>(req);
            const storedName = await learningRepository.caminhoPdf(id, user.id, user.classificacao);
            const directory = storageDirectory();
            const filePath = path.resolve(directory, storedName);
            if (path.dirname(filePath) !== directory) {
                throw new AppError("Arquivo PDF não encontrado.", 404);
            }
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", "inline");
            res.setHeader("Cache-Control", "private, no-store");
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.sendFile(filePath, (error) => {
                if (!error) return;
                if (res.headersSent) {
                    res.destroy(error);
                    return;
                }
                const code = "code" in error && typeof error.code === "string" ? error.code : "";
                if (code === "ENOENT" || code === "ENOTDIR") {
                    next(new AppError("O arquivo PDF deste treinamento não está disponível. Solicite o reenvio do anexo.", 404));
                    return;
                }
                next(error);
            });
        } catch (error) {
            next(error);
        }
    },

    async enviarAvaliacao(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const user = requireUser(req);
            assertEmployee(user);
            const { id } = validatedParams<{ id: string }>(req);
            const data = validatedBody<SubmitAssessmentDTO>(req);
            success(res, await learningRepository.enviarAvaliacao(id, user.id, data.respostas), 201);
        } catch (error) {
            next(error);
        }
    },
};
