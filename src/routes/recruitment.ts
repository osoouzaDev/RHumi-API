import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";
import { validate } from "../middlewares/validate.js";
import {
    applicationIdParamsSchema,
    createCandidateApplicationSchema,
    createVacancySchema,
    updateApplicationStatusSchema,
    updateVacancyStatusSchema,
    vacancyStatusParamsSchema,
} from "../modules/recruitment/dto.js";
import { recruitmentController } from "../modules/recruitment/controller.js";

export const recruitmentRouter = Router();

recruitmentRouter.get("/api/recrutamento/vagas", autenticarToken, recruitmentController.listVacancies);
recruitmentRouter.post(
    "/api/recrutamento/vagas",
    autenticarToken,
    authAdmin,
    validate({ body: createVacancySchema }),
    recruitmentController.createVacancy
);
recruitmentRouter.patch(
    "/api/recrutamento/vagas/:id/status",
    autenticarToken,
    authAdmin,
    validate({ params: vacancyStatusParamsSchema, body: updateVacancyStatusSchema }),
    recruitmentController.updateVacancyStatus
);
recruitmentRouter.get(
    "/api/recrutamento/candidaturas",
    autenticarToken,
    recruitmentController.listApplications
);
recruitmentRouter.post(
    "/api/recrutamento/candidaturas",
    autenticarToken,
    authAdmin,
    validate({ body: createCandidateApplicationSchema }),
    recruitmentController.createApplication
);
recruitmentRouter.patch(
    "/api/recrutamento/candidaturas/:id/status",
    autenticarToken,
    authAdmin,
    validate({ params: applicationIdParamsSchema, body: updateApplicationStatusSchema }),
    recruitmentController.updateApplicationStatus
);
