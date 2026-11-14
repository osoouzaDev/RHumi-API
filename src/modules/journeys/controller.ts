import type { Request, Response, NextFunction } from "express";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { success } from "../../shared/http/success.js";
import type {
    JourneyStageParams,
    JourneyTaskParams,
    UpdateJourneyTaskDTO,
} from "./dto.js";
import { journeysRepository } from "./repository.js";

export const journeysController = {
    async listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await journeysRepository.listar());
        } catch (error) {
            next(error);
        }
    },

    async atualizarTarefa(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const params = validatedParams<JourneyTaskParams>(req);
            const data = validatedBody<UpdateJourneyTaskDTO>(req);
            success(
                res,
                await journeysRepository.atualizarTarefa(
                    params.usuarioId,
                    params.etapaKey,
                    params.tarefaKey,
                    data,
                ),
            );
        } catch (error) {
            next(error);
        }
    },

    async reabrirEtapa(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const params = validatedParams<JourneyStageParams>(req);
            success(
                res,
                await journeysRepository.reabrirEtapa(params.usuarioId, params.etapaKey),
            );
        } catch (error) {
            next(error);
        }
    },
};
