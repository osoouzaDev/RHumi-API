import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";
import { validate } from "../middlewares/validate.js";
import {
    journeyStageParamsSchema,
    journeyTaskParamsSchema,
    updateJourneyTaskSchema,
} from "../modules/journeys/dto.js";
import { journeysController } from "../modules/journeys/controller.js";

export const journeysRouter = Router();

journeysRouter.get(
    "/api/jornadas",
    autenticarToken,
    journeysController.listar,
);

journeysRouter.patch(
    "/api/jornadas/:usuarioId/etapas/:etapaKey/tarefas/:tarefaKey",
    autenticarToken,
    authAdmin,
    validate({ params: journeyTaskParamsSchema, body: updateJourneyTaskSchema }),
    journeysController.atualizarTarefa,
);

journeysRouter.delete(
    "/api/jornadas/:usuarioId/etapas/:etapaKey",
    autenticarToken,
    authAdmin,
    validate({ params: journeyStageParamsSchema }),
    journeysController.reabrirEtapa,
);
