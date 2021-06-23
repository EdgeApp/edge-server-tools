interface CausedBy<C> {
  cause: C
}

export function errorCause<T extends Error, C extends Error>(
  error: T,
  cause: C
): T & CausedBy<C> {
  // @ts-expect-error
  error.cause = cause
  // Extend the error's stack with the cause's stack
  if (error.stack != null && cause.stack != null) {
    error.stack += '\n' + cause.stack
  }
  // @ts-expect-error
  return error
}
