import { asMaybe, asObject, Cleaner, CleanerShape } from 'cleaners'

/**
 * Cleans an object that may contain errors.
 *
 * Tries to fix individual properties when possible.
 * For key-value objects, this will drop invalid entries.
 * For shape objects, this will use the matching property
 * on the fallback object.
 */
export function asHealingObject<T>(
  cleaner: Cleaner<T>
): Cleaner<{ [keys: string]: T }>
export function asHealingObject<T extends object>(
  shape: CleanerShape<T>,
  fallback: T
): Cleaner<T>
export function asHealingObject<T>(
  ...args: [Cleaner<T>] | [CleanerShape<T>, T]
): Cleaner<T> | Cleaner<{ [keys: string]: T }> {
  const [shapeOrCleaner, fallback] = args

  if (typeof shapeOrCleaner === 'function') {
    const cleaner = shapeOrCleaner
    return function asMaybeObject(raw) {
      if (typeof raw !== 'object' || raw == null) return {}

      const out: any = {}
      const keys = Object.keys(raw)
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i]
        if (key === '__proto__') continue
        try {
          out[key] = cleaner(raw[key]) as any
        } catch (error) {}
      }
      return out
    }
  }

  const shape = shapeOrCleaner
  const safeShape: any = { ...shape }
  for (const key of Object.keys(shape)) {
    // @ts-expect-error
    safeShape[key] = asMaybe(shape[key], fallback[key])
  }
  // @ts-expect-error
  return asMaybe(asObject(shape), fallback)
}
