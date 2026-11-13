import { z } from "zod";

export const journeyTaskParamsSchema = z.object({
    usuarioId: z.string().uuid(),
    etapaKey: z.string().regex(/^[a-z0-9-]+$/),
    tarefaKey: z.string().regex(/^[a-z0-9-]+$/),
});

export const journeyStageParamsSchema = z.object({
    usuarioId: z.string().uuid(),
    etapaKey: z.string().regex(/^[a-z0-9-]+$/),
});

export const updateJourneyTaskSchema = z.object({
    concluida: z.boolean(),
});

export type JourneyTaskParams = z.infer<typeof journeyTaskParamsSchema>;
export type JourneyStageParams = z.infer<typeof journeyStageParamsSchema>;
export type UpdateJourneyTaskDTO = z.infer<typeof updateJourneyTaskSchema>;
