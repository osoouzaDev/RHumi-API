import { AppError } from "../../shared/errors/app-error.js";
import type { AuthRequest } from "../../middlewares/auth.js";
import type { CalendarEvent, CalendarSector, CreateCalendarEventDTO } from "./dto.js";
import { calendarRepository } from "./repository.js";

const adminProfiles = new Set(["sakai", "admin", "hr_admin"]);
const supervisorProfiles = new Set(["supervisor", "gestor"]);
const employeeProfiles = new Set(["employee", "usuario", "user"]);
const calendarProfiles = new Set([...adminProfiles, ...supervisorProfiles, ...employeeProfiles]);

function getProfile(user: NonNullable<AuthRequest["user"]>): string {
    return user.classificacao.trim().toLowerCase();
}

export const calendarService = {
    async listarSetores(user: NonNullable<AuthRequest["user"]>): Promise<CalendarSector[]> {
        if (!adminProfiles.has(getProfile(user))) throw new AppError("Acesso negado.", 403);
        return calendarRepository.listarSetores(user.id);
    },

    async listar(user: NonNullable<AuthRequest["user"]>): Promise<CalendarEvent[]> {
        if (!calendarProfiles.has(getProfile(user))) throw new AppError("Acesso negado.", 403);
        return calendarRepository.listar(user.id);
    },

    async criar(user: NonNullable<AuthRequest["user"]>, data: CreateCalendarEventDTO): Promise<CalendarEvent> {
        const profile = getProfile(user);
        const isAdmin = adminProfiles.has(profile);
        const isSupervisor = supervisorProfiles.has(profile);

        if (!calendarProfiles.has(profile)) throw new AppError("Acesso negado.", 403);
        if (data.escopo === "EMPRESA" && !isAdmin) {
            throw new AppError("Apenas administradores podem criar eventos para toda a empresa.", 403);
        }
        if (data.escopo === "SETOR" && !isAdmin && !isSupervisor) {
            throw new AppError("Apenas supervisores e administradores podem criar eventos para um setor.", 403);
        }

        if (data.escopo === "SETOR" && isSupervisor) {
            if (data.id_setor) {
                throw new AppError("O supervisor só pode agendar para o setor que supervisiona.", 403);
            }
            const sectors = await calendarRepository.listarSetoresDoUsuario(user.id);
            if (!sectors.id_setor) throw new AppError("Seu usuário não possui um setor vinculado.", 403);
            return calendarRepository.criar(user.id, data, data.escopo, sectors.id_setor);
        }

        if (data.escopo === "SETOR" && isAdmin) {
            if (!data.id_setor) throw new AppError("Selecione o setor do evento.", 400);
            return calendarRepository.criar(user.id, data, data.escopo, data.id_setor);
        }

        if (data.id_setor) throw new AppError("Não informe um setor para evento pessoal ou da empresa.", 400);
        return calendarRepository.criar(user.id, data, data.escopo, null);
    },

    async excluir(user: NonNullable<AuthRequest["user"]>, eventId: string): Promise<void> {
        if (!calendarProfiles.has(getProfile(user))) throw new AppError("Acesso negado.", 403);
        await calendarRepository.excluir(user.id, eventId);
    },
};
