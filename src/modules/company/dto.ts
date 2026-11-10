import { z } from "zod";

export const updateCompanySchema = z.object({
    nome_empresa: z.string().trim().min(1, "Informe o nome da empresa.").max(255),
    cnpj: z.string().trim().regex(
        /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/,
        "Informe um CNPJ válido."
    ),
    rua: z.string().trim().max(255),
    numero_end: z.string().trim().max(20),
    bairro: z.string().trim().max(120),
    cep: z.string().trim().max(12),
    cidade: z.string().trim().max(120),
    estado: z.string().trim().max(2),
    telefone: z.string().trim().max(30),
    email: z.union([z.literal(""), z.email().max(255)]),
    fundacao: z.union([z.literal(""), z.iso.date()]),
    sobre_empresa: z.string().trim().max(5000),
    nome_pagina_carreiras: z.string().trim().max(255),
    homepage_carreiras: z.string().trim().max(500),
    chamada_carreiras: z.string().trim().max(500),
    descricao_carreiras: z.string().trim().max(5000),
    missao: z.string().trim().max(2000),
    visao: z.string().trim().max(2000),
    valores: z.string().trim().max(2000),
});

export type UpdateCompanyDTO = z.infer<typeof updateCompanySchema>;

export const createSectorSchema = z.object({
    nome_setor: z.string().trim().min(1, "Informe o nome do setor.").max(150),
    icone: z.string().trim().max(120).optional(),
});

export type CreateSectorDTO = z.infer<typeof createSectorSchema>;

export const sectorIdParamsSchema = z.object({
    id: z.uuid("Identificador de setor inválido."),
});

export interface Company {
    id: string;
    nome_empresa: string;
    cnpj: string;
    rua: string | null;
    numero_end: string | null;
    bairro: string | null;
    cep: string | null;
    cidade: string | null;
    estado: string | null;
    telefone: string | null;
    email: string | null;
    fundacao: string | null;
    sobre_empresa: string | null;
    nome_pagina_carreiras: string | null;
    homepage_carreiras: string | null;
    chamada_carreiras: string | null;
    descricao_carreiras: string | null;
    missao: string | null;
    visao: string | null;
    valores: string | null;
    created_at: string;
    updated_at: string;
    total_colaboradores: number;
    setores: CompanySector[];
    classificacoes: string[];
}

export interface CompanySector {
    id: string;
    nome_setor: string;
    icone: string | null;
    quantidade: number;
}
