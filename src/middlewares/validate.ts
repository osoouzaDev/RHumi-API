/**
 * Middleware de validação de entrada utilizando a biblioteca Zod.
 *
 * Objetivo:
 *   - Garantir que `body`, `query` e `params` de um request Express atendam
 *     a um schema antes de chegar ao controller. Schema inválido é respondido
 *     com **422 Unprocessable Entity** e uma lista estruturada de erros
 *     (caminho do campo + mensagem), facilitando debug no frontend.
 *
 * Uso típico em rotas:
 *   ```
 *   router.post("/", validate({ body: createUserSchema }), usersController.criar);
 *   ```
 *
 * Helpers auxiliares (`validatedBody`, `validatedQuery`, `validatedParams`)
 * servem como cast tipado seguro dentro dos controllers, já que o Zod
 * garantiu a forma do objeto no middleware anterior.
 */

import { z, type ZodSchema, type ZodError } from "zod";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { fail } from "../shared/http/success.js";
import { AppError } from "../shared/errors/app-error.js";

/**
 * Descreve quais partes do request serão validadas. Todas são opcionais —
 * o middleware só valida o que for explicitamente informado.
 */
type ValidateSchemas = {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
};

/**
 * Factory de middleware: recebe os schemas e retorna um `RequestHandler`
 * pronto para ser encadeado em uma rota Express.
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            // Zod `.parse()` retorna o objeto validado e COERCIDO (conversões
            // automáticas de string → number quando o schema pede z.coerce.number()),
            // por isso reatribuímos de volta ao `req`.
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
            }
            next();
        } catch (error) {
            const zodError = error as ZodError;
            // Trata erros de validação Zod → 422 com lista estruturada.
            if (zodError && "issues" in zodError) {
                const mensagens = zodError.issues.map((issue) => ({
                    campo: issue.path.join("."),
                    mensagem: issue.message,
                }));
                fail(res, "Dados de entrada inválidos.", 422, { erros: mensagens });
                return;
            }
            // Qualquer outro erro inesperado no meio do parse → 500.
            next(new AppError("Erro interno na validação.", 500));
        }
    };
}

/**
 * Cast tipado do `req.body` já validado. Uso:
 *   const body = validatedBody<CriarUsuarioDTO>(req);
 */
export function validatedBody<T>(req: Request): T {
    return req.body as T;
}

/**
 * Cast tipado do `req.query` já validado.
 */
export function validatedQuery<T>(req: Request): T {
    return req.query as unknown as T;
}

/**
 * Cast tipado do `req.params` já validado.
 */
export function validatedParams<T>(req: Request): T {
    return req.params as unknown as T;
}
