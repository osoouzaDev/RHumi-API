import { z } from "zod";

const httpUrl = z.string().trim().url().refine(
    (value) => ["http:", "https:"].includes(new URL(value).protocol),
    "Informe uma URL HTTP ou HTTPS válida.",
);

function youtubeVideoId(value: string): string | null {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        const segments = url.pathname.split("/").filter(Boolean);
        if (hostname === "youtu.be" || hostname === "www.youtu.be") return segments[0] ?? null;
        if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(hostname)) {
            return null;
        }
        return url.searchParams.get("v") ?? segments.at(-1) ?? null;
    } catch {
        return null;
    }
}

const questionSchema = z.object({
    id: z.string().uuid().optional(),
    texto: z.string().trim().min(1).max(2000),
    alternativas: z.array(z.object({
        id: z.string().uuid().optional(),
        texto: z.string().trim().min(1).max(500),
        correta: z.boolean(),
    }).strict()).min(2).max(20).refine(
        (alternatives) => alternatives.filter((alternative) => alternative.correta).length === 1,
        "Cada pergunta deve possuir exatamente uma resposta correta.",
    ),
}).strict();

const trainingProofSchema = z.object({
    ativa: z.boolean(),
    titulo: z.string().trim().max(200).nullable(),
    descricao: z.string().trim().max(5000).nullable(),
    nota_minima: z.number().int().min(0).max(100),
    perguntas: z.array(questionSchema).max(100),
}).strict();

export const learningItemParamsSchema = z.object({ id: z.string().uuid() });

export const deleteLearningItemSchema = z.object({
    apagar_resultados: z.boolean(),
}).strict();

export const saveLearningItemSchema = z.object({
    tipo: z.enum(["TREINAMENTO", "AVALIACAO"]),
    titulo: z.string().trim().min(2).max(200),
    descricao: z.string().trim().max(5000).nullable(),
    setores: z.array(z.string().uuid()).min(1).max(100),
    ativo: z.boolean(),
    tipo_material: z.enum(["YOUTUBE", "ARTIGO", "PDF"]).nullable(),
    url_material: httpUrl.nullable(),
    perguntas: z.array(questionSchema).max(100).optional(),
    prova: trainingProofSchema.optional(),
}).strict().superRefine((item, context) => {
    if (item.tipo === "TREINAMENTO") {
        if (!item.tipo_material) {
            context.addIssue({ code: "custom", path: ["tipo_material"], message: "Selecione o tipo de conteúdo." });
        }
        if (item.tipo_material === "YOUTUBE" && !item.url_material) {
            context.addIssue({ code: "custom", path: ["url_material"], message: "Informe a URL do vídeo." });
        }
        if (item.tipo_material === "ARTIGO" && !item.url_material) {
            context.addIssue({ code: "custom", path: ["url_material"], message: "Informe a URL do artigo." });
        }
        if (item.tipo_material === "YOUTUBE" && item.url_material) {
            const videoId = youtubeVideoId(item.url_material);
            if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
                context.addIssue({ code: "custom", path: ["url_material"], message: "Informe uma URL válida do YouTube." });
            }
        }
        if (item.perguntas !== undefined) {
            context.addIssue({ code: "custom", path: ["perguntas"], message: "Treinamentos não aceitam perguntas." });
        }
        if (item.prova?.ativa) {
            if (!item.prova.titulo || item.prova.titulo.length < 2) {
                context.addIssue({ code: "custom", path: ["prova", "titulo"], message: "Informe o título da prova." });
            }
            if (!item.prova.perguntas.length) {
                context.addIssue({ code: "custom", path: ["prova", "perguntas"], message: "Adicione ao menos uma pergunta à prova." });
            }
        }
    } else {
        if (item.tipo_material !== null || item.url_material !== null) {
            context.addIssue({ code: "custom", path: ["tipo_material"], message: "Avaliações não aceitam conteúdo de vídeo, artigo ou PDF." });
        }
        if (item.prova !== undefined) {
            context.addIssue({ code: "custom", path: ["prova"], message: "Avaliações independentes não aceitam prova vinculada." });
        }
        if (!item.perguntas?.length) {
            context.addIssue({ code: "custom", path: ["perguntas"], message: "Adicione ao menos uma pergunta." });
        }
    }
});

export const submitAssessmentSchema = z.object({
    respostas: z.array(z.object({
        pergunta_id: z.string().uuid(),
        alternativa_id: z.string().uuid(),
    }).strict()).min(1).max(100),
}).strict();

export type SaveLearningItemDTO = z.infer<typeof saveLearningItemSchema>;
export type SubmitAssessmentDTO = z.infer<typeof submitAssessmentSchema>;
