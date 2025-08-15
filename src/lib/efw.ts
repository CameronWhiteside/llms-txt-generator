type ErrorFirstCallableResultError = [Error, undefined];
type ErrorFirstCallableResultSuccess<T> = [undefined, T];

type ErrorFirstCallableResult<T> = ErrorFirstCallableResultError | ErrorFirstCallableResultSuccess<T>;

/**
 * Similar to node's util.callbackify, but with explicit returns for error-first callback result
 * Intended to clean up "last mile" try/catch blocks and protect against unhandled promise rejections
 */

export function efw<Result>(callable: () => Result): ErrorFirstCallableResult<Result> {
  try {
    const result: Result = callable();
    return [undefined, result];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return [error, undefined];
  }
}

export async function efwAsync<Result>(callable: Promise<Result>): Promise<ErrorFirstCallableResult<Result>> {
  try {
    const result: Result = await callable;
    return [undefined, result];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return [error, undefined];
  }
}
