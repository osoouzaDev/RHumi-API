/**
 * Arquivo principal de montagem da aplicação Express.
 *
 * Este módulo é responsável por:
 * - criar a instância do servidor HTTP;
 * - aplicar middlewares globais de segurança e infraestrutura;
 * - registrar todos os routers da API;
 * - centralizar a pipeline de tratamento de requisições.
 *
 * A separação entre `app.ts` e `server.ts` é uma boa prática:
 * - `app.ts` define a aplicação e sua configuração;
 * - `server.ts` inicia a porta e faz o boot do processo.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { corsOptions } from "./config/cors.js";
import { globalLimiter } from "./config/rateLimit.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { companyRouter } from "./routes/company.js";
import { healthRouter } from "./routes/health.js";
import { reportsRouter } from "./routes/reports.js";
import { journeysRouter } from "./routes/journeys.js";
import { recruitmentRouter } from "./routes/recruitment.js";
import { usersRouter } from "./routes/users.js";
import { attachRequestId, type RequestWithId } from "./utils/request.js";

/**
 * Extensões do objeto Express para incluir identificadores e body cru em cada requisição.
 * Isso permite que middlewares e controllers tenham acesso a um requestId para logs e
 * a um rawBody para assinaturas de webhook ou validações customizadas.
 */
declare global {
    namespace Express {
        interface Request {
            requestId?: string;
            rawBody?: string;
        }
    }
}

/**
 * Cria a instância principal da aplicação Express com todos os middlewares e rotas.
 *
 * A função é exportada para permitir testes e para manter a aplicação desacoplada do
 * processo de boot do servidor, facilitando a criação de ambientes de desenvolvimento,
 * testes e produção.
 */
export function createApp(): express.Express {
    const app = express();

    // Remove o header padrão do Express que expõe tecnologia da aplicação.
    app.disable("x-powered-by");

    // Configura o proxy para permitir uso de cookies e IPs reais quando a app estiver
    // atrás de um proxy/reverse proxy como Nginx, Traefik ou serviços cloud.
    app.set("trust proxy", 1);

    // Adiciona cabeçalhos de segurança básicos em todas as respostas HTTP.
    app.use(helmet());

    // Configura o CORS com uma whitelist de origens permitidas.
    app.use(cors(corsOptions));

    // Injeta um requestId em cada requisição para rastreio de logs e debugging.
    app.use(attachRequestId);

    // Habilita parsing de JSON com limite de tamanho e captura do payload bruto.
    app.use(
        express.json({
            limit: "20kb",
            verify: (req: express.Request, _res, buffer) => {
                const request = req as RequestWithId;
                request.rawBody = buffer.toString("utf-8");
            },
        })
    );

    // Habilita parsing de formulários URL-encoded com limite e preservação do body bruto.
    app.use(
        express.urlencoded({
            limit: "20kb",
            extended: true,
            verify: (req: express.Request, _res, buffer) => {
                const request = req as RequestWithId;
                request.rawBody = buffer.toString("utf-8");
            },
        })
    );

    // Limita o número de requisições por IP para reduzir abuso e ataques de força bruta.
    app.use(globalLimiter);

    // Registra os módulos principais da API por domínio funcional.
    app.use(healthRouter);
    app.use(authRouter);
    app.use(companyRouter);
    app.use(usersRouter);
    app.use(journeysRouter);
    app.use(recruitmentRouter);
    app.use(reportsRouter);

    // Middleware final de tratamento de erros, sempre funcionando como última etapa da pipeline.
    app.use(errorHandler);

    return app;
}
