import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";
import { validate } from "../middlewares/validate.js";
import {
    createSectorSchema,
    sectorIdParamsSchema,
    updateCompanySchema,
} from "../modules/company/dto.js";
import { companyController } from "../modules/company/controller.js";

export const companyRouter = Router();

companyRouter.get(
    "/api/empresa",
    autenticarToken,
    companyController.buscar
);

companyRouter.put(
    "/api/empresa",
    autenticarToken,
    authAdmin,
    validate({ body: updateCompanySchema }),
    companyController.atualizar
);

companyRouter.post(
    "/api/empresa/setores",
    autenticarToken,
    authAdmin,
    validate({ body: createSectorSchema }),
    companyController.criarSetor
);

companyRouter.delete(
    "/api/empresa/setores/:id",
    autenticarToken,
    authAdmin,
    validate({ params: sectorIdParamsSchema }),
    companyController.removerSetor
);
