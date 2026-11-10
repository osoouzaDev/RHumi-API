import { z } from "zod";

export const vacancyContractTypeSchema = z.enum(["CLT", "PJ", "TEMPORARIO", "ESTAGIARIO"]);
export const vacancyStatusSchema = z.enum(["ABERTA", "PAUSADA", "ENCERRADA"]);
export const applicationStatusSchema = z.enum([
    "NOVA",
    "EM_SELECAO",
    "ENTREVISTA",
    "CONTRATADA",
    "REPROVADA",
]);

export const createVacancySchema = z.object({
    titulo: z.string().trim().min(2).max(150),
    setor: z.string().trim().min(1).max(150),
    localidade: z.string().trim().max(150).nullable().optional(),
    tipo_contrato: vacancyContractTypeSchema,
    descricao: z.string().trim().max(10000).nullable().optional(),
});

export const vacancyStatusParamsSchema = z.object({
    id: z.uuid("Identificador de vaga inválido."),
});

export const updateVacancyStatusSchema = z.object({
    status: vacancyStatusSchema,
});

export const createCandidateApplicationSchema = z.object({
    nome: z.string().trim().min(2).max(200),
    email: z.email().max(255).transform((value) => value.toLocaleLowerCase("pt-BR")),
    telefone: z.string().trim().max(30).nullable().optional(),
    id_vaga: z.uuid("Selecione uma vaga válida."),
});

export const applicationIdParamsSchema = z.object({
    id: z.uuid("Identificador de candidatura inválido."),
});

export const updateApplicationStatusSchema = z.object({
    status: applicationStatusSchema,
});

export type CreateVacancyDTO = z.infer<typeof createVacancySchema>;
export type VacancyStatus = z.infer<typeof vacancyStatusSchema>;
export type CreateCandidateApplicationDTO = z.infer<typeof createCandidateApplicationSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;
