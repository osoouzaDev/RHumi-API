import assert from "node:assert/strict";
import test from "node:test";
import { deleteLearningItemSchema, saveLearningItemSchema } from "./dto.js";

const sectorId = "e41e5c72-16aa-43bc-b4fb-15920ee6a113";

function training(overrides: Record<string, unknown> = {}) {
    return {
        tipo: "TREINAMENTO",
        titulo: "Integração",
        descricao: null,
        setores: [sectorId],
        ativo: true,
        tipo_material: "YOUTUBE",
        url_material: "https://www.youtube.com/watch?v=abcdefghijk",
        ...overrides,
    };
}

test("accepts a YouTube video and HTTP article URLs", () => {
    assert.equal(saveLearningItemSchema.safeParse(training()).success, true);
    assert.equal(saveLearningItemSchema.safeParse(training({
        tipo_material: "ARTIGO",
        url_material: "https://example.com/guide",
    })).success, true);
});

test("rejects non-YouTube video links and non-HTTP(S) URLs", () => {
    assert.equal(saveLearningItemSchema.safeParse(training({
        url_material: "https://example.com/video",
    })).success, false);
    assert.equal(saveLearningItemSchema.safeParse(training({
        tipo_material: "ARTIGO",
        url_material: "ftp://example.com/guide",
    })).success, false);
});

test("accepts an optional training proof with a minimum passing score", () => {
    const proof = {
        ativa: true,
        titulo: "Prova da Aula",
        descricao: null,
        nota_minima: 70,
        perguntas: [{
            texto: "Qual é a prioridade?",
            alternativas: [
                { texto: "Segurança", correta: true },
                { texto: "Velocidade", correta: false },
            ],
        }],
    };
    assert.equal(saveLearningItemSchema.safeParse(training({ prova: proof })).success, true);
    assert.equal(saveLearningItemSchema.safeParse(training({
        prova: { ...proof, nota_minima: 101 },
    })).success, false);
    assert.equal(saveLearningItemSchema.safeParse(training({
        prova: { ...proof, perguntas: [] },
    })).success, false);
});

test("requires a question with exactly one correct option in an assessment", () => {
    const assessment = {
        tipo: "AVALIACAO",
        titulo: "Integração",
        descricao: null,
        setores: [sectorId],
        ativo: true,
        tipo_material: null,
        url_material: null,
        perguntas: [{
            texto: "Qual é a prioridade?",
            alternativas: [
                { texto: "Segurança", correta: true },
                { texto: "Velocidade", correta: false },
            ],
        }],
    };
    assert.equal(saveLearningItemSchema.safeParse(assessment).success, true);
    assert.equal(saveLearningItemSchema.safeParse({
        ...assessment,
        perguntas: [{ ...assessment.perguntas[0], alternativas: [
            { texto: "A", correta: true },
            { texto: "B", correta: true },
        ] }],
    }).success, false);
});

test("requires explicit result-deletion confirmation", () => {
    assert.equal(deleteLearningItemSchema.safeParse({ apagar_resultados: true }).success, true);
    assert.equal(deleteLearningItemSchema.safeParse({ apagar_resultados: false }).success, true);
    assert.equal(deleteLearningItemSchema.safeParse({}).success, false);
    assert.equal(deleteLearningItemSchema.safeParse({ apagar_resultados: true, extra: true }).success, false);
});
