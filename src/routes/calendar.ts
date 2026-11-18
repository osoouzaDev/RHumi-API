import { Router } from "express";
import { autenticarToken } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { calendarController } from "../modules/calendar/controller.js";
import { calendarEventParamsSchema, createCalendarEventSchema } from "../modules/calendar/dto.js";

export const calendarRouter = Router();

calendarRouter.get("/api/calendario/setores", autenticarToken, calendarController.listarSetores);
calendarRouter.get("/api/calendario/eventos", autenticarToken, calendarController.listar);
calendarRouter.post(
    "/api/calendario/eventos",
    autenticarToken,
    validate({ body: createCalendarEventSchema }),
    calendarController.criar,
);
calendarRouter.delete(
    "/api/calendario/eventos/:id",
    autenticarToken,
    validate({ params: calendarEventParamsSchema }),
    calendarController.excluir,
);

export default calendarRouter;
