/**
 * Tipo `Result<T, E>` para representar operações que podem falhar de forma
 * previsível, sem recorrer a exceções (ver design.md → "Padrão de Resultado").
 *
 * Os serviços devolvem `Result<T, E>` para que a camada de UI possa mapear
 * erros para mensagens em português junto aos campos.
 */

/** Resultado bem-sucedido contendo o valor `T`. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Resultado de falha contendo o erro `E`. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** União discriminada de sucesso (`ok`) ou falha (`err`). */
export type Result<T, E> = Ok<T> | Err<E>;

/** Constrói um resultado de sucesso. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Constrói um resultado de falha. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Type guard que estreita um `Result` para `Ok<T>`. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/** Type guard que estreita um `Result` para `Err<E>`. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Aplica `fn` ao valor de um resultado bem-sucedido, propagando o erro caso
 * o resultado seja uma falha.
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/**
 * Aplica `fn` ao erro de um resultado de falha, propagando o valor caso o
 * resultado seja um sucesso.
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/**
 * Devolve o valor de um resultado bem-sucedido ou o `fallback` em caso de falha.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
