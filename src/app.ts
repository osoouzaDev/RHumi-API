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
import { recruitmentRouter } from "./routes/recruitment.js";
import { reportsRouter } from "./routes/reports.js";
import { usersRouter } from "./routes/users.js";
import { attachRequestId, type RequestWithId } from "./utils/request.js";

declare global {
    namespace Express {
        interface Request {
            requestId?: string;
            rawBody?: string;
        }
    }
}

export function createApp(): express.Express {
    const app = express();

    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use(helmet());
    app.use(cors(corsOptions));
    app.use(attachRequestId);
    app.use(
        express.json({
            limit: "20kb",
            verify: (req: express.Request, _res, buffer) => {
                const request = req as RequestWithId;
                request.rawBody = buffer.toString("utf-8");
            },
        })
    );
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
    app.use(globalLimiter);

    app.use(healthRouter);
    app.use(authRouter);
    app.use(companyRouter);
    app.use(usersRouter);
    app.use(recruitmentRouter);
    app.use(reportsRouter);
    app.use(errorHandler);

    return app;
}
