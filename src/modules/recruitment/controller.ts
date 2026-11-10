import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../middlewares/auth.js";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { created, success } from "../../shared/http/success.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
    ApplicationStatus,
    CreateCandidateApplicationDTO,
    CreateVacancyDTO,
    VacancyStatus,
} from "./dto.js";
import { recruitmentRepository } from "./repository.js";

function authenticatedUserId(req: AuthRequest): string {
    if (!req.user?.id) {
        throw new AppError("Usuário não autenticado.", 401);
    }
    return req.user.id;
}

export const recruitmentController = {
    async listVacancies(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.listVacancies(authenticatedUserId(req)));
        } catch (error) {
            next(error);
        }
    },

    async createVacancy(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<CreateVacancyDTO>(req);
            created(res, await recruitmentRepository.createVacancy(authenticatedUserId(req), data));
        } catch (error) {
            next(error);
        }
    },

    async updateVacancyStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const { status } = validatedBody<{ status: VacancyStatus }>(req);
            success(res, await recruitmentRepository.updateVacancyStatus(authenticatedUserId(req), id, status));
        } catch (error) {
            next(error);
        }
    },

    async listApplications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.listApplications(authenticatedUserId(req)));
        } catch (error) {
            next(error);
        }
    },

    async createApplication(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<CreateCandidateApplicationDTO>(req);
            created(res, await recruitmentRepository.createApplication(authenticatedUserId(req), data));
        } catch (error) {
            next(error);
        }
    },

    async updateApplicationStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const { status } = validatedBody<{ status: ApplicationStatus }>(req);
            success(res, await recruitmentRepository.updateApplicationStatus(
                authenticatedUserId(req),
                id,
                status
            ));
        } catch (error) {
            next(error);
        }
    },
};
