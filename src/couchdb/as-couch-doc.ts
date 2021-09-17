import { asCodec, asOptional, asString, Cleaner, uncleaner } from 'cleaners'

/**
 * A CouchDb document, transformed to remove the _id and _rev properties.
 */
export interface CouchDoc<T> {
  doc: T
  id: string
  rev?: string
}

export function asCouchDoc<T>(cleaner: Cleaner<T>): Cleaner<CouchDoc<T>> {
  const wasCleaner = uncleaner(cleaner)
  return asCodec(
    raw => {
      if (typeof raw !== 'object' || raw == null) {
        throw new TypeError('Expected an object')
      }
      const { _id, _rev, ...rest } = raw
      return {
        doc: cleaner(rest),
        id: asString(_id),
        rev: asRev(_rev)
      }
    },
    clean => ({
      ...wasCleaner(clean.doc),
      _id: clean.id,
      _rev: clean.rev
    })
  )
}

const asRev = asOptional(asString)
