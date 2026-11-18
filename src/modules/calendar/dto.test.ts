import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarEventSchema } from "./dto.js";

const event = {
    titulo: "Reunião de equipe",
    data: "2026-11-18",
    horario: "09:30",
    categoria: "Reunião",
    escopo: "PESSOAL",
};

test("validates a personal calendar event", () => {
    assert.equal(createCalendarEventSchema.safeParse(event).success, true);
});

test("validates sector events with an explicit sector id", () => {
    assert.equal(
        createCalendarEventSchema.safeParse({
            ...event,
            escopo: "SETOR",
            id_setor: "123e4567-e89b-12d3-a456-426614174000",
        }).success,
        true,
    );
});

test("rejects invalid date, time, scope, and unexpected properties", () => {
    for (const invalidEvent of [
        { ...event, data: "18-11-2026" },
        { ...event, horario: "25:90" },
        { ...event, escopo: "PUBLICO" },
        { ...event, creator_id: "another-user" },
    ]) {
        assert.equal(createCalendarEventSchema.safeParse(invalidEvent).success, false);
    }
});
