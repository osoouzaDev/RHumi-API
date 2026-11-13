import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin, authCandidate } from "../middlewares/authAdmin.js";
import { validate } from "../middlewares/validate.js";
import {
    applicationStatusParamsSchema,
    candidateApplicationSchema,
    candidateRegistrationSchema,
    createVacancySchema,
    updateApplicationStatusSchema,
    updateVacancyStatusSchema,
    vacancyStatusParamsSchema,
} from "../modules/recruitment/dto.js";
import { recruitmentController } from "../modules/recruitment/controller.js";

export const recruitmentRouter = Router();

recruitmentRouter.get(
    "/api/public/vagas",
    recruitmentController.listarVagasPublicas,
);

recruitmentRouter.post(
    "/api/public/candidatos",
    validate({ body: candidateRegistrationSchema }),
    recruitmentController.registrarCandidato,
);

recruitmentRouter.get(
    "/api/candidato/candidaturas",
    autenticarToken,
    authCandidate,
    recruitmentController.listarMinhasCandidaturas,
);

recruitmentRouter.post(
    "/api/candidato/candidaturas",
    autenticarToken,
    authCandidate,
    validate({ body: candidateApplicationSchema }),
    recruitmentController.candidatar,
);

recruitmentRouter.get(
    "/api/recrutamento/vagas",
    autenticarToken,
    authAdmin,
    recruitmentController.listarVagas,
);

recruitmentRouter.post(
    "/api/recrutamento/vagas",
    autenticarToken,
    authAdmin,
    validate({ body: createVacancySchema }),
    recruitmentController.criarVaga,
);

recruitmentRouter.patch(
    "/api/recrutamento/vagas/:id/status",
    autenticarToken,
    authAdmin,
    validate({ params: vacancyStatusParamsSchema, body: updateVacancyStatusSchema }),
    recruitmentController.atualizarStatusVaga,
);

recruitmentRouter.get(
    "/api/recrutamento/candidaturas",
    autenticarToken,
    authAdmin,
    recruitmentController.listarCandidaturas,
);

recruitmentRouter.patch(
    "/api/recrutamento/candidaturas/:id/status",
    autenticarToken,
    authAdmin,
    validate({ params: applicationStatusParamsSchema, body: updateApplicationStatusSchema }),
    recruitmentController.atualizarStatusCandidatura,
);
