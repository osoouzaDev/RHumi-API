import type { Request, Response, NextFunction } from "express";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { noContent, success } from "../../shared/http/success.js";
import type { CreateSectorDTO, UpdateCompanyDTO } from "./dto.js";
import { companyRepository } from "./repository.js";

export const companyController = {
    async buscar(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await companyRepository.buscar());
        } catch (error) {
            next(error);
        }
    },

    async atualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<UpdateCompanyDTO>(req);
            success(res, await companyRepository.atualizar(data));
        } catch (error) {
            next(error);
        }
    },

    async criarSetor(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<CreateSectorDTO>(req);
            success(res, await companyRepository.criarSetor(data), 201);
        } catch (error) {
            next(error);
        }
    },

    async removerSetor(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            await companyRepository.removerSetor(id);
            noContent(res);
        } catch (error) {
            next(error);
        }
    },
};
