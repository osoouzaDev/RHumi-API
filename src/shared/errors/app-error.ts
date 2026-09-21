/**
 * Hierarquia de erros de DOMÍNIO da aplicação.
 *
 * Por que `AppError` e não `Error` nativo?
 *   - `AppError` carrega um `statusCode` HTTP, então o middleware global
 *     `errorHandler` sabe exatamente qual código retornar sem usar `switch`
 *     baseado em mensagem de string (frágil).
 *   - `AppError` faz um `instanceof` de match claro; qualquer outro erro
 *     cai no fallback 500 do middleware global (segurança por obscuridade).
 *   - `Object.setPrototypeOf(this, AppError.prototype)` é uma prática
 *     recomendada pelo TypeScript ao estender built-ins (Error, Array, Map);
 *     sem ela, `instanceof AppError` falha em alguns runtimes antigos
 *     (ex.: ES5 target) por causa da forma que V8 ajusta o protótipo.
 */

export class AppError extends Error {
    /** Código HTTP a ser devolvido pelo middleware de erro. Padrão 400 Bad Request. */
    public readonly statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
