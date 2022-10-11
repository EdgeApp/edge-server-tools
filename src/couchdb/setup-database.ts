import nano, { DatabaseCreateParams, DocumentScope } from 'nano'

import { matchJson } from '../util/match-json'
import {
  asMaybeExistsError,
  asMaybeNotFoundError
} from './couch-error-cleaners'
import {
  clusterHasDatabase,
  makeReplicatorDocuments,
  ReplicatorSetupDocument
} from './replicator-setup-document'
import { SyncedDocument } from './synced-document'
import { watchDatabase, WatchDatabaseOptions } from './watch-database'

/**
 * Describes a single Couch database that should exist.
 */
export interface DatabaseSetup
  extends Pick<WatchDatabaseOptions, 'onChange' | 'syncedDocuments'> {
  // The database name:
  name: string

  // Options to pass to CouchDB when creating this database:
  options?: DatabaseCreateParams

  // Documents that should exactly match:
  documents?: { [id: string]: object }

  // Documents that we should create, unless they already exist:
  templates?: { [id: string]: object }

  // Used for filtering, in addition to the wallet name:
  tags?: Array<`#${string}`>

  // Deprecated. Adds '#archived' to default tag list:
  ignoreMissing?: boolean

  // Deprecated. Put this in the options instead:
  replicatorSetup?: SyncedDocument<ReplicatorSetupDocument>
}

export interface SetupDatabaseOptions {
  // The couch cluster name the current client is connected to,
  // as described in the replicator setup document.
  // This controls which databases and replications we create.
  // Falls back to "default" if missing:
  currentCluster?: string

  // Describes which database and replications should exist on each cluster:
  replicatorSetup?: SyncedDocument<ReplicatorSetupDocument>

  // The setup routine will subscribe to the changes feed if
  // the setup includes an `onChange` callback or synced documents.
  // This option disables watching, performing a one-time sync instead.
  disableWatching?: boolean

  // Logs status messages whenever we write things to Couch:
  log?: (message: string) => void

  // Logs error messages whenever something goes wrong:
  onError?: (error: unknown) => void
}

/**
 * Ensures that the requested database exists in CouchDB.
 * Returns a cleanup function, which removes any background tasks.
 */
export async function setupDatabase(
  connectionOrUri: nano.ServerScope | string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions = {}
): Promise<() => void> {
  const { name, onChange, syncedDocuments = [] } = setupInfo
  const {
    replicatorSetup = setupInfo.replicatorSetup,
    disableWatching = false,
    log = console.log,
    onError = error => {
      log(`Error while maintaining database "${name}": ${String(error)})`)
    }
  } = opts
  const connection =
    typeof connectionOrUri === 'string'
      ? nano(connectionOrUri)
      : connectionOrUri

  // Run the setup once to ensure the database exists:
  const db = await doSetup(connection, setupInfo, opts)
  if (db == null) return () => {}

  // Update or watch synced documents:
  const cleanups: Array<() => void> = []
  const canWatch = onChange != null || syncedDocuments.length > 0
  if (canWatch && !disableWatching) {
    cleanups.push(
      await watchDatabase(db, { onChange, onError, syncedDocuments })
    )
  } else {
    await Promise.all(syncedDocuments.map(async doc => await doc.sync(db)))
  }

  // Watch the replicator document:
  if (replicatorSetup != null && !disableWatching) {
    cleanups.push(
      replicatorSetup.onChange(() => {
        doSetup(connection, setupInfo, opts).catch(onError)
      })
    )
  }

  return () => cleanups.forEach(cleanup => cleanup())
}

/**
 * Performs the actual work of database setup.
 * This is a one-shot process, and doesn't subscribe to anything.
 */
async function doSetup(
  connection: nano.ServerScope,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions
): Promise<DocumentScope<unknown> | undefined> {
  const { documents = {}, name, options, templates = {} } = setupInfo
  const { currentCluster = 'default', log = console.log } = opts
  const replicatorSetup = opts.replicatorSetup?.doc ??
    setupInfo.replicatorSetup?.doc ?? { clusters: {} }

  // Bail out if the current cluster doesn't have this database:
  const { exists, replicated } = clusterHasDatabase(
    replicatorSetup,
    currentCluster,
    setupInfo
  )
  if (!exists) return

  // Create the database if needed:
  const existingInfo = await connection.db.get(name).catch(error => {
    if (asMaybeNotFoundError(error) == null) throw error
  })
  if (existingInfo == null) {
    await connection.db.create(name, options).catch(error => {
      if (asMaybeExistsError(error) == null) throw error
    })
    log(`Created database "${name}"`)
  }
  const db: DocumentScope<unknown> = connection.db.use(name)

  // Update documents:
  for (const id of Object.keys(documents)) {
    const { _id, _rev, ...rest } = await db.get(id).catch(error => {
      if (asMaybeNotFoundError(error) == null) throw error
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
      if (asMaybeNotFoundError(error) == null) throw error
      return { _id: id, _rev: undefined }
    })

    if (_rev == null) {
      await db.insert({ _id, ...templates[id] })
      log(`Wrote document "${id}" in database "${name}".`)
    }
  }

  if (replicated) {
    // Figure out the current username:
    const sessionInfo = await connection.session()
    const currentUsername: string = sessionInfo.userCtx.name

    // Set up replication:
    await doSetup(
      connection,
      {
        name: '_replicator',
        documents: makeReplicatorDocuments(
          replicatorSetup,
          currentCluster,
          currentUsername,
          setupInfo
        )
      },
      opts
    )
  }

  return db
}
