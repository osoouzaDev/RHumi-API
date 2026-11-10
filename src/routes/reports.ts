/**
 * Definição de rotas do sub-domínio "Relatórios Gerenciais".
 *
 * Propósito do módulo reports no contexto RHumi:
 *   Oferecer ao gestor de RH as visões consolidadas necessárias para tomada
 *   de decisão. Os casos de uso de emissão real implementam consultas
 *   analíticas (read-side), em oposição aos comandos do módulo users.
 *
 * Autorização e LGPD (Lei 13.709/2018 — Lei Geral de Proteção de Dados):
 *   Relatórios frequentemente contêm listagem nominal de colaboradores e
 *   trilha de auditoria de acessos, ambos considerados "dados pessoais"
 *   conforme art. 5º, II, da LGPD. Por isso as rotas abaixo aplicam:
 *
 *   • `autenticarToken` em TODAS as rotas (inclusive listar disponíveis,
 *     para evitar vazamento do escopo de relatórios existentes a clientes anônimos).
 *   • `authAdmin` na rota de EMISSÃO (POST /api/relatorios), pois gerar CSV/JSON
 *     de listagem nominal é operação de alto risco; usuários com perfil
 *     "usuario" e "gestor" podem ser limitados no futuro via roles.
 *
 * Convenção de nomenclatura:
 *   Recurso usa substantivo português `/relatorios`, coerente com `/usuarios`
 *   e demais coleções REST do RHumi.
 *
 * Futuras extensões (roadmap):
 *   • GET  /api/relatorios/:id    → Buscar relatório já emitido por UUID.
 *   • GET  /api/relatorios/:id/download → Forçar download mesmo em formato JSON.
 *   • POST /api/relatorios/agendar → Agendar emissão recorrente (enviar por e-mail).
 */

import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { generateReportSchema } from "../modules/reports/dto.js";
import { reportsController } from "../modules/reports/controller.js";
import { autenticarToken } from "../middlewares/auth.js";
import { authAdmin } from "../middlewares/authAdmin.js";

/**
 * Instância do Router do Express para rotas de relatórios.
 */
export const reportsRouter = Router();

/**
 * Rota: GET /api/relatorios — UC "Listar Catálogo de Relatórios Disponíveis".
 *
 * Função: auto-descoberta (HATEOAS simplificado) para o frontend construir
 * dinamicamente o formulário de emissão: quais tipos existem, quais parâmetros
 * são suportados por cada um. Resposta em JSON com envelope success.
 *
 * Requer apenas `autenticarToken` (admin/sakai/gestor/usuario todos podem
 * ver o catálogo); apenas a emissão efetiva requer perfil mais elevado.
 */
reportsRouter.get(
    "/api/relatorios",
    autenticarToken,
    reportsController.listarDisponiveis
);

/**
 * Rota: POST /api/relatorios — UC "Emitir Relatório Gerencial".
 *
 * Pipeline completo da requisição:
 *   1. autenticarToken → sessão ativa existe.
 *   2. authAdmin       → caller é admin ou sakai (LGPD).
 *   3. validate({ body: generateReportSchema }) →
 *      tipo ∈ enum, data_inicio/data_fim ISO válidas, formato ∈ json|csv.
 *   4. reportsController.gerar() →
 *      se formato=json: envelope success<T>;
 *      se formato=csv:  resposta `attachment` com RFC 4180 e charset utf-8.
 *
 * Nota: por enquanto a operação é síncrona (relatórios pequenos / vazios).
 * Quando volume crescer, quebrar em processamento assíncrono (fila BullMQ
 * com Redis) + endpoint de status + webhook / e-mail de conclusão.
 */
reportsRouter.post(
    "/api/relatorios",
    autenticarToken,
    authAdmin,
    validate({ body: generateReportSchema }),
    reportsController.gerar
);

/**
 * Exportação default.
 */
export default reportsRouter;
