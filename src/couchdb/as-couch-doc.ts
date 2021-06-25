import {
  asCodec,
  asObject,
  asOptional,
  asString,
  Cleaner,
  uncleaner
} from 'cleaners'

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
      const clean = asCouchMetadata(raw)
      return { doc: cleaner(raw), id: clean._id, rev: clean._rev }
    },
    clean => ({
      _id: clean.id,
      _rev: clean.rev,
      ...(wasCleaner(clean.doc) as any)
    })
  )
}

const asCouchMetadata = asObject({ _id: asString, _rev: asOptional(asString) })
