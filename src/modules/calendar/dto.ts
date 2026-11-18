import { z } from "zod";

export const calendarEventParamsSchema = z.object({
    id: z.string().uuid(),
});

export const createCalendarEventSchema = z.object({
    titulo: z.string().trim().min(1).max(200),
    data: z.iso.date(),
    horario: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
    categoria: z.string().trim().min(1).max(40),
    escopo: z.enum(["PESSOAL", "SETOR", "EMPRESA"]),
    id_setor: z.string().uuid().optional(),
}).strict();

export type CreateCalendarEventDTO = z.infer<typeof createCalendarEventSchema>;

export interface CalendarEvent {
    id: string;
    titulo: string;
    data: string;
    horario: string;
    categoria: string;
    escopo: "PESSOAL" | "SETOR" | "EMPRESA";
    id_setor: string | null;
    nome_setor: string | null;
    id_criador: string | null;
}

export interface CalendarSector {
    id: string;
    nome_setor: string;
}
