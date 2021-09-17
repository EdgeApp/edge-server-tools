import { asMaybe, asObject, asValue, Cleaner, uncleaner } from 'cleaners'
import { DocumentScope } from 'nano'
import { makeEvent, OnEvent } from 'yavent'

import { matchJson } from '../util/match-json'

/**
 * Babysits a Couch document, ensuring it exists and is clean.
 *
 * The `sync` method fetches, cleans, and updates the document
 * on the database (which might involve creating the document).
 * It then updates the babysitter object with the final result
 * and calls `onChange` if the contents or rev differ.
 */
export interface SyncedDocument<T> {
  doc: T
  rev?: string

  readonly id: string
  readonly onChange: OnEvent<T>

  /**
   * Syncs the document with the database.
   * Creates or repairs missing or unclean documents,
   * but throws all other database failures.
   */
  readonly sync: (db: DocumentScope<unknown>) => Promise<void>
}

/**
 * Babysits a Couch document, ensuring it exists and is clean.
 *
 * The cleaner should be able to turn the empty object (`{}`)
 * into a valid fallback value, such as by using `asMaybe`.
 * The fallback will be the initial value of the returned babysitter,
 * until `sync` is called to sync with the database.
 */
export function syncedDocument<T>(
  id: string,
  cleaner: Cleaner<T>
): SyncedDocument<T> {
  const fallback = cleaner({})
  const asDocument = asMaybe(cleaner, fallback)
  const wasDocument = uncleaner(asDocument)
  const [on, emit] = makeEvent<T>()

  const out: SyncedDocument<T> = {
    doc: fallback,
    rev: undefined,
    id,
    onChange: on,

    sync: withMutex(async (db: DocumentScope<unknown>): Promise<void> => {
      const { _id, _rev, ...rest } = await db.get(id).catch(error => {
        if (asMaybeNotFound(error) == null) throw error
        return { _id: id, _rev: undefined }
      })
      const clean = asDocument(rest)
      const dirty = wasDocument(clean)
      if (_rev == null || !matchJson(dirty, rest)) {
        const result = await db.insert({ _id, _rev, ...dirty })
        out.rev = result.rev
        out.doc = clean
        emit(clean)
      } else if (out.rev !== _rev) {
        out.rev = _rev
        out.doc = clean
        emit(clean)
      }
    })
  }
  return out
}

/**
 * Causes the passed function to never run in parallel.
 */
function withMutex<A extends unknown[], R>(
  f: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  let running: Promise<R> | undefined
  return async (...args: A): Promise<R> => {
    if (running == null) running = f(...args)
    else running = running.then(async () => await f(...args))
    return await running
  }
}

const asMaybeNotFound = asMaybe(
  asObject({
    error: asValue('not_found')
  })
)
