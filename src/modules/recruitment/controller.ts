import type { Request, Response, NextFunction } from "express";
import { validatedBody, validatedParams } from "../../middlewares/validate.js";
import { success } from "../../shared/http/success.js";
import { authService } from "../auth/service.js";
import { usuariosService } from "../users/service.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
    CandidateApplicationDTO,
    CandidateRegistrationDTO,
    CreateVacancyDTO,
    UpdateApplicationStatusDTO,
    UpdateVacancyStatusDTO,
} from "./dto.js";
import { recruitmentRepository } from "./repository.js";
import type { AuthRequest } from "../../middlewares/auth.js";

export const recruitmentController = {
    async listarVagas(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.listarVagas());
        } catch (error) {
            next(error);
        }
    },

    async listarVagasPublicas(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.listarVagasPublicas());
        } catch (error) {
            next(error);
        }
    },

    async registrarCandidato(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const data = validatedBody<CandidateRegistrationDTO>(req);
            const user = await usuariosService.criar({
                login: data.email,
                nome: data.nome,
                email: data.email,
                senha: data.senha,
                classificacao: "CANDIDATE",
                ativo: true,
                telefone: data.telefone ?? null,
            });
            const tokens = await authService.autenticar({
                email: data.email,
                senha: data.senha,
            });
            success(res, {
                ...tokens,
                profile: {
                    id: user.id,
                    userLogin: user.login,
                    classificacao: user.classificacao,
                },
            }, 201);
        } catch (error) {
            next(error);
        }
    },

    async criarVaga(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.criarVaga(validatedBody<CreateVacancyDTO>(req)), 201);
        } catch (error) {
            next(error);
        }
    },

    async atualizarStatusVaga(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const data = validatedBody<UpdateVacancyStatusDTO>(req);
            success(res, await recruitmentRepository.atualizarStatusVaga(id, data));
        } catch (error) {
            next(error);
        }
    },

    async listarCandidaturas(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            success(res, await recruitmentRepository.listarCandidaturas());
        } catch (error) {
            next(error);
        }
    },

    async atualizarStatusCandidatura(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { id } = validatedParams<{ id: string }>(req);
            const data = validatedBody<UpdateApplicationStatusDTO>(req);
            success(res, await recruitmentRepository.atualizarStatusCandidatura(id, data));
        } catch (error) {
            next(error);
        }
    },

    async listarMinhasCandidaturas(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const usuarioId = (req as AuthRequest).user?.id;
            if (!usuarioId) throw new AppError("Usuário não autenticado.", 401);
            success(res, await recruitmentRepository.listarCandidaturasDoCandidato(usuarioId));
        } catch (error) {
            next(error);
        }
    },

    async candidatar(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const usuarioId = (req as AuthRequest).user?.id;
            if (!usuarioId) throw new AppError("Usuário não autenticado.", 401);
            const data = validatedBody<CandidateApplicationDTO>(req);
            success(res, await recruitmentRepository.candidatarComoUsuario(usuarioId, data), 201);
        } catch (error) {
            next(error);
        }
    },
};
