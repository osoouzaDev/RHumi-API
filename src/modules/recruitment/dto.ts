import { z } from "zod";

const contractTypeSchema = z.enum(["CLT", "PJ", "TEMPORARIO", "ESTAGIARIO"]);
const vacancyStatusSchema = z.enum(["ABERTA", "PAUSADA", "ENCERRADA"]);
const applicationStatusSchema = z.enum([
    "NOVA",
    "EM_SELECAO",
    "ENTREVISTA",
    "CONTRATADA",
    "REPROVADA",
]);

export const createVacancySchema = z.object({
    titulo: z.string().trim().min(2).max(200),
    setor: z.string().trim().min(1).max(150),
    localidade: z.string().trim().max(200).nullable(),
    tipo_contrato: contractTypeSchema,
    descricao: z.string().trim().max(5000).nullable().optional(),
});

export const vacancyStatusParamsSchema = z.object({ id: z.string().uuid() });
export const updateVacancyStatusSchema = z.object({ status: vacancyStatusSchema });

export const candidateRegistrationSchema = z.object({
    nome: z.string().trim().min(2).max(200),
    email: z.string().trim().email().max(100),
    telefone: z.string().trim().max(30).nullable().optional(),
    senha: z.string().trim().min(8).max(255),
}).strict();

export const candidateApplicationSchema = z.object({
    id_vaga: z.string().uuid(),
});

export const applicationStatusParamsSchema = z.object({ id: z.string().uuid() });
export const updateApplicationStatusSchema = z.object({ status: applicationStatusSchema });

export type CreateVacancyDTO = z.infer<typeof createVacancySchema>;
export type UpdateVacancyStatusDTO = z.infer<typeof updateVacancyStatusSchema>;
export type UpdateApplicationStatusDTO = z.infer<typeof updateApplicationStatusSchema>;
export type CandidateRegistrationDTO = z.infer<typeof candidateRegistrationSchema>;
export type CandidateApplicationDTO = z.infer<typeof candidateApplicationSchema>;
