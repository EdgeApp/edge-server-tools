import { asMaybe, asObject, asValue } from 'cleaners'
import nano, { DatabaseCreateParams, DocumentScope } from 'nano'

import { matchJson } from '../util/match-json'
import { SyncedDocument } from './synced-document'
import { watchDatabase } from './watch-database'

/**
 * Describes a single Couch database that should exist.
 */
export interface DatabaseSetup {
  name: string
  options?: DatabaseCreateParams

  // Documents that should exactly match:
  documents?: { [id: string]: object }

  // Documents that we should keep up-to-date:
  syncedDocuments?: Array<SyncedDocument<unknown>>

  // Documents that we should create, unless they already exist:
  templates?: { [id: string]: object }
}

export interface SetupDatabaseOptions {
  log?: (message: string) => void

  // Set this to true to perform a one-time sync,
  // so synced documents will not auto-update:
  disableWatching?: boolean
}

/**
 * Ensures that the requested database exists in Couch.
 */
export async function setupDatabase(
  couchUri: string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions = {}
): Promise<void> {
  const {
    name,
    options,
    documents = {},
    syncedDocuments = [],
    templates = {}
  } = setupInfo
  const {
    log = console.log,
    // Don't watch the database unless there are synced documents:
    disableWatching = syncedDocuments.length === 0
  } = opts
  const connection = nano(couchUri)

  // Create missing databases:
  const existingDbs = await connection.db.list()
  if (!existingDbs.includes(name)) {
    await connection.db.create(name, options)
    log(`Created database "${name}"`)
  }
  const db: DocumentScope<any> = connection.db.use(name)

  // Update documents:
  for (const id of Object.keys(documents)) {
    const { _id, _rev, ...rest } = await db.get(id).catch(error => {
      if (asMaybeNotFound(error) == null) throw error
      return { _id: id, _rev: undefined }
    })

    if (!matchJson(documents[id], rest)) {
      await db.insert({ _id, _rev, ...documents[id] })
      log(`Wrote document "${id}" in database "${name}".`)
    }
  }

  // Create template documents:
  for (const id of Object.keys(templates)) {
    const { _id, _rev } = await db.get(id).catch(error => {
      if (asMaybeNotFound(error) == null) throw error
      return { _id: id, _rev: undefined }
    })

    if (_rev == null) {
      await db.insert({ _id, ...templates[id] })
      log(`Wrote document "${id}" in database "${name}".`)
    }
  }

  // Update or watch synced documents:
  if (disableWatching) {
    await Promise.all(syncedDocuments.map(async doc => await doc.sync(db)))
  } else {
    await watchDatabase(db, {
      syncedDocuments,
      onError(error) {
        log(`Error watching database ${name}: ${String(error)})`)
      }
    })
  }
}

const asMaybeNotFound = asMaybe(
  asObject({
    error: asValue('not_found')
  })
)
