import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";
import { validate } from "../middlewares/validate.js";
import { learningController, uploadPdf } from "../modules/learning/controller.js";
import {
    deleteLearningItemSchema,
    learningItemParamsSchema,
    saveLearningItemSchema,
    submitAssessmentSchema,
} from "../modules/learning/dto.js";

export const learningRouter = Router();

learningRouter.get(
    "/api/capacitacoes",
    autenticarToken,
    learningController.listar,
);
learningRouter.post(
    "/api/capacitacoes",
    autenticarToken,
    authAdmin,
    uploadPdf,
    learningController.criar,
);
learningRouter.put(
    "/api/capacitacoes/:id",
    autenticarToken,
    authAdmin,
    validate({ params: learningItemParamsSchema }),
    uploadPdf,
    learningController.atualizar,
);
learningRouter.patch(
    "/api/capacitacoes/:id/status",
    autenticarToken,
    authAdmin,
    validate({ params: learningItemParamsSchema }),
    learningController.atualizarStatus,
);
learningRouter.delete(
    "/api/capacitacoes/:id",
    autenticarToken,
    authAdmin,
    validate({ params: learningItemParamsSchema, body: deleteLearningItemSchema }),
    learningController.excluir,
);
learningRouter.get(
    "/api/capacitacoes/desempenho",
    autenticarToken,
    authAdmin,
    learningController.listarDesempenho,
);
learningRouter.get(
    "/api/capacitacoes/:id/resultados",
    autenticarToken,
    authAdmin,
    validate({ params: learningItemParamsSchema }),
    learningController.listarResultados,
);
learningRouter.get(
    "/api/capacitacoes/:id/pdf",
    autenticarToken,
    validate({ params: learningItemParamsSchema }),
    learningController.visualizarPdf,
);
learningRouter.post(
    "/api/capacitacoes/:id/respostas",
    autenticarToken,
    validate({ params: learningItemParamsSchema, body: submitAssessmentSchema }),
    learningController.enviarAvaliacao,
);

export default learningRouter;
