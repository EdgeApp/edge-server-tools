/**
 * Ponyfill for the new ES2021 AggregateError type.
 */
export class AggregateError extends Error {
  errors: unknown[]

  constructor(errors: unknown[], message?: string) {
    super(message)
    this.errors = errors
    this.name = 'AggregateError'
  }
}

/**
 * Ponyfill for the new ES2021 `Promise.any` method.
 * Waits for the first successful promise.
 * If no promise succeeds, returns an `AggregateError` with all the failures.
 */
export async function promiseAny<T>(promises: Array<Promise<T>>): Promise<T> {
  return await new Promise((resolve, reject) => {
    const errors: unknown[] = []
    for (const promise of promises) {
      promise.then(resolve, error => {
        errors.push(error)
        if (errors.length >= promises.length) {
          reject(new AggregateError(errors))
        }
      })
    }
  })
}

/**
 * Validates that an object duck-types as an AggregateError instance.
 */
export function asMaybeAggregateError(
  raw: unknown
): AggregateError | undefined {
  const typeHack: any = raw
  if (
    raw instanceof Error &&
    raw.name === 'AggregateError' &&
    Array.isArray(typeHack.errors)
  ) {
    return typeHack
  }
}

/**
 * Turns an error into a string, with special handling for AggregateErrors.
 */
export function stringifyError(error: unknown): string {
  let out = String(error)
  const aggregate = asMaybeAggregateError(error)
  if (aggregate != null) {
    for (const error of aggregate.errors) {
      out += `\n- ${stringifyError(error).replace(/\n/g, '\n  ')}`
    }
  }
  return out
}
