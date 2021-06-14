import nano, { DatabaseCreateParams, DocumentScope } from 'nano'

import { matchJson } from '../util/match-json'

/**
 * Describes a single database that should exist.
 */
export interface CouchDbSetup {
  name: string
  options?: DatabaseCreateParams

  // Documents that should exactly match:
  documents?: { [id: string]: object }

  // Documents that we should create, unless they already exist:
  templates?: { [id: string]: object }
}

export interface SetupCouchDbOptions {
  log: ((...args: any) => void) | null
}

/**
 * Ensures that the requested databases exist in Couch.
 */
export async function setupCouchDb(
  couchUri: string,
  setupInfo: CouchDbSetup,
  opt: SetupCouchDbOptions = { log: console.log }
): Promise<void> {
  // If log is explicitly set to null, then default to a noop function
  const log = opt.log ?? (() => undefined)
  const { name, options, documents = {}, templates = {} } = setupInfo
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
    const { _id = id, _rev, ...rest } = await db.get(id).catch(() => ({}))

    if (!matchJson(documents[id], rest)) {
      await db.insert({ _id, _rev, ...documents[id] })
      log(`Wrote document "${id}" in database "${name}".`)
    }
  }

  // Create template documents:
  for (const id of Object.keys(templates)) {
    const { _id = id, _rev } = await db.get(id).catch(() => ({}))

    if (_rev == null) {
      await db.insert({ _id, ...documents[id] })
      log(`Wrote document "${id}" in database "${name}".`)
    }
  }
}
