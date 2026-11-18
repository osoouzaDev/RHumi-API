import type { NextFunction, Request, Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.js";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { AppError } from "../../shared/errors/app-error.js";
import { created, noContent, success } from "../../shared/http/success.js";
import type { CreateCalendarEventDTO } from "./dto.js";
import { calendarEventParamsSchema } from "./dto.js";
import { calendarService } from "./service.js";

function requireUser(req: Request): NonNullable<AuthRequest["user"]> {
    const user = (req as AuthRequest).user;
    if (!user?.id) throw new AppError("Usuário não autenticado.", 401);
    return user;
}

export const calendarController = {
    async listarSetores(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await calendarService.listarSetores(requireUser(req)), 200);
        } catch (error) {
            next(error);
        }
    },

    async listar(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await calendarService.listar(requireUser(req)), 200);
        } catch (error) {
            next(error);
        }
    },

    async criar(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<CreateCalendarEventDTO>(req);
            created(res, await calendarService.criar(requireUser(req), data));
        } catch (error) {
            next(error);
        }
    },

    async excluir(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            await calendarService.excluir(requireUser(req), id);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
