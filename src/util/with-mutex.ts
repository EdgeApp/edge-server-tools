/**
 * Causes the passed function to never run in parallel.
 */
export function withMutex<A extends unknown[], R>(
  f: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  let running: Promise<R> | undefined
  return async (...args: A): Promise<R> => {
    if (running == null) running = f(...args)
    else running = running.then(async () => await f(...args))
    return await running
  }
}
