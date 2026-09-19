import express from "express";
import cors from "cors";
import helmet from "helmet";
import { corsOptions } from "./config/cors";
import { globalLimiter } from "./config/rateLimit";
import { errorHandler } from "./middlewares/errorHandler";
import { authRouter } from "./routes/auth";
import { healthRouter } from "./routes/health";
import { reportsRouter } from "./routes/reports";
import { usersRouter } from "./routes/users";
import { attachRequestId } from "./utils/request";

export function createApp() {
    const app = express();

    app.disable("x-powered-by");
    app.set("trust proxy", 1);

    app.use(helmet());
    app.use(cors(corsOptions));
    app.options(".*", cors(corsOptions));
    app.use(attachRequestId);
    app.use(
        express.json({
            limit: "20kb",
            verify: (req, _res, buffer) => {
                const request = req as express.Request;
                request.rawBody = buffer.toString("utf-8");
            },
        })
    );

    app.use(
        express.urlencoded({
            limit: "20kb",
            extended: true,
            verify: (req, _res, buffer) => {
                const request = req as express.Request;
                request.rawBody = buffer.toString("utf-8");
            },
        })
    );
    app.use(globalLimiter);
    app.use(healthRouter);
    app.use(authRouter);
    app.use(usersRouter);
    app.use(reportsRouter);
    app.use(errorHandler);
}