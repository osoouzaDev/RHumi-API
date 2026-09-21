/**
 * Objetos de Transferência de Dados (Data Transfer Objects — DTOs) e contratos
 * de tipagem para o recurso "Relatórios" do módulo RHumi.
 *
 * Objetivo do módulo Reports:
 *   Disponibilizar endpoints de emissão de relatórios gerenciais para
 *   acompanhamento de pessoal (usuários ativos/inativos, distribuição por
 *   classificação, log de acessos). Atende a requisitos não-funcionais de
 *   auditoria (LGPD art. 46 — registro de operações de tratamento) e
 *   business intelligence estratégico da gestão de RH.
 *
 * Formatos de saída suportados:
 *   (a) application/json — payload estruturado com metadados + listagem.
 *       Ideal para consumo programático (frontend dashboards, integrações).
 *   (b) text/csv — Comma-Separated Values com RFC 4180 quoting.
 *       Ideal para exportação para planilhas eletrônicas e tratamento batch.
 *
 * Tipos de relatórios disponíveis (enumerador `tipoRelatorioEnum`):
 *   - usuarios-ativos      : relação de colaboradores com `ativo = true`.
 *   - usuarios-inativos    : relação de colaboradores com `ativo = false`.
 *   - classificacao-usuarios: distribuição percentual/absoluta por RBAC.
 *   - acessos-recentes     : trilha de auditoria de autenticações (jwt).
 *
 * O padrão empregado segue o "Schema-first" com Zod:
 *   1. Schema Zod é a fonte única da verdade (runtime validation).
 *   2. Tipos TypeScript (`TipoRelatorio`, `GenerateReportDTO`) são derivados
 *      por inferência de tipos via `z.infer<typeof schema>`.
 *   3. Constantes (`RELATORIOS_DISPONIVEIS`) usam as interfaces tipadas para
 *      garantir sincronia entre o catálogo apresentado ao usuário e a
 *      implementação real no service.
 */

import { z } from "zod";

/**
 * Enumerador fechado de tipos de relatório suportados pelo sistema.
 *
 * Característica "closed set" (conjunto fechado): o backend só emite relatórios
 * cuja chave pertença a este enum; qualquer valor desconhecido é rejeitado na
 * validação do `generateReportSchema`. Adotar z.enum (e não string livre)
 * evita "SQL Injection" semântico — passagem de tipos arbitrários que poderiam,
 * em uma implementação futura, atingir queries parametrizadas indevidamente.
 *
 * Valores e suas semânticas:
 *  - `usuarios-ativos`      : UC "Emitir Relação de Usuários Ativos".
 *  - `usuarios-inativos`    : UC "Emitir Relação de Usuários Inativos".
 *  - `classificacao-usuarios`: UC "Emitir Distribuição por Classificação RBAC".
 *  - `acessos-recentes`     : UC "Emitir Trilha de Autenticações".
 */
export const tipoRelatorioEnum = z.enum([
    "usuarios-ativos",
    "usuarios-inativos",
    "classificacao-usuarios",
    "acessos-recentes",
]);

/**
 * Tipo nominal derivado do enumerador Zod `tipoRelatorioEnum`.
 *
 * Equivalente ao tipo união:
 *   type TipoRelatorio = "usuarios-ativos" | "usuarios-inativos" | ...
 * Usado em assinaturas de service/controller para receber/retornar apenas
 * valores válidos do conjunto.
 */
export type TipoRelatorio = z.infer<typeof tipoRelatorioEnum>;

/**
 * Schema Zod para validação de payload do endpoint `POST /reports/generate`.
 *
 * Regras de validação implementadas:
 *
 *   1. `tipo`: campo obrigatório, membro de `tipoRelatorioEnum`.
 *      Falha se não for um dos quatro valores suportados.
 *
 *   2. `data_inicio` (opcional): string ISO-8601 válida.
 *      Refinamento (z.refine) garante que o valor — se informado — seja
 *      parseável por `Date.parse()` e não resulte em `NaN`.
 *      Observação: não usamos `z.coerce.date()` para evitar que o Zod faça
 *      coerções silenciosas de formatos arbitrários; deixamos a string ISO
 *      passar intacta até a service, que faz o parse explicitamente.
 *
 *   3. `data_fim` (opcional): idem à data_inicio, com a mesma regra de ISO.
 *
 *   4. `formato` (opcional, padrão "json"): enum `"json" | "csv"`.
 *      Define o tipo MIME e a estrutura de resposta do controller. O padrão
 *      `"json"` é escolhido por ser o formato nativo de APIs REST.
 *
 * Observação: a consistência entre `data_inicio <= data_fim` NÃO é validada
 * AQUI, mas sim na service (`relatoriosService.gerar()`). Isso porque a regra
 * envolve a comparação de DOIS campos — cross-field validation é de
 * responsabilidade da camada de negócio, e não de um schema atômico de DTO.
 */
export const generateReportSchema = z.object({
    tipo: tipoRelatorioEnum,
    data_inicio: z.string()
        .optional()
        .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
            message: "data_inicio deve ser uma data ISO válida.",
        }),
    data_fim: z.string()
        .optional()
        .refine((v) => v === undefined || !Number.isNaN(Date.parse(v)), {
            message: "data_fim deve ser uma data ISO válida.",
        }),
    formato: z.enum(["json", "csv"]).default("json"),
});

/**
 * Tipo derivado do schema `generateReportSchema`.
 *
 * Estrutura do objeto após parse seguro pelo Zod:
 *  - `tipo`         : TipoRelatorio (obrigatório).
 *  - `data_inicio?` : string ISO-8601 opcional.
 *  - `data_fim?`    : string ISO-8601 opcional.
 *  - `formato`      : "json" | "csv" (sempre presente graças a .default("json")).
 */
export type GenerateReportDTO = z.infer<typeof generateReportSchema>;

/**
 * Interface do objeto de domínio "Relatório" (resultado de emissão).
 *
 * Campos de metadados (header do envelope):
 *  - `id`              : UUID v4 por emissão (rastreabilidade).
 *  - `tipo`            : Qual relatório foi pedido.
 *  - `data_geracao`    : Timestamp ISO-8601 da produção.
 *  - `periodo?`        : Janela de tempo solicitada (se aplicável ao tipo).
 *  - `formato`         : Formato de serialização escolhido.
 *  - `total_registros` : Cardinalidade do conjunto `dados`.
 *  - `sumario`         : Estatísticas agregadas (ex.: total_usuarios,
 *                        autenticacoes_sucesso...). Estrutura variável por tipo.
 *
 * Campo de dados (payload real do relatório):
 *  - `dados: Array<Record<string, unknown>>`
 *    Cada elemento representa UMA LINHA do relatório. Escolhemos `Record` por
 *    ser flexível (cada tipo tem colunas diferentes) — numa etapa posterior de
 *    tipagem forte, cada tipo poderia ter sua própria interface de linha; por
 *    enquanto, `Record<string, unknown>` serve como "dynamic row" semelhante
 *    a `any[]` mas com checagem de propriedade string.
 */
export interface Relatorio {
    id: string;
    tipo: TipoRelatorio;
    data_geracao: string;
    periodo?: {
        data_inicio?: string | undefined;
        data_fim?: string | undefined;
    } | undefined;
    formato: "json" | "csv";
    total_registros: number;
    dados: Array<Record<string, unknown>>;
    sumario: Record<string, unknown>;
}

/**
 * Item do catálogo "relatórios disponíveis", retornado pelo discovery endpoint.
 *
 * Objetivo: permitir que o frontend construa dinamicamente sua tela de emissão
 * sem hard-coded listas. Implementa auto-descoberta de API (HATEOAS simplificado)
 * — cada item informa quais parâmetros o usuário informativo pode preencher.
 *
 * Campos:
 *  - `tipo`                 : chave do enumerador (identificador canônico).
 *  - `descricao`            : texto amigável exibido ao usuário final.
 *  - `parametros_suportados`: subconjunto de campos do DTO habilitados para
 *                             este tipo. Ex.: relatório de classificação não
 *                             precisa de janela de datas → só ["formato"].
 */
export interface RelatorioListagem {
    tipo: TipoRelatorio;
    descricao: string;
    parametros_suportados: string[];
}

/**
 * Catálogo constante (hard-coded, pois não muda em runtime) de relatórios.
 *
 * Sincronizado com `tipoRelatorioEnum`: cada membro do enum deve ter seu
 * correspondente nesta lista. Se o enum for expandido (ex.: novo relatório
 * "aniversariantes-do-mes"), esta constante deve ser atualizada na mesma
 * alteração; a tipagem `RelatorioListagem[]` garante que TypeScript acuse
 * se o `tipo` informado não pertencer a `TipoRelatorio`.
 *
 * Observação: `parametros_suportados` é informativo apenas — a SERVICE deve
 * aplicar as regras duras de negócio (ex.: relatório de classificação ignora
 * datas mesmo que sejam passadas). O catálogo só orienta a UI.
 */
export const RELATORIOS_DISPONIVEIS: RelatorioListagem[] = [
    {
        tipo: "usuarios-ativos",
        descricao: "Lista de usuários com status ativo no sistema.",
        parametros_suportados: ["data_inicio", "data_fim", "formato"],
    },
    {
        tipo: "usuarios-inativos",
        descricao: "Lista de usuários com status inativo no sistema.",
        parametros_suportados: ["data_inicio", "data_fim", "formato"],
    },
    {
        tipo: "classificacao-usuarios",
        descricao: "Distribuição de usuários por classificação (sakai, admin, gestor, usuario).",
        parametros_suportados: ["formato"],
    },
    {
        tipo: "acessos-recentes",
        descricao: "Histórico de autenticações realizadas no período informado.",
        parametros_suportados: ["data_inicio", "data_fim", "formato"],
    },
];
