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
  /** The database name. */
  name: string

  /** Options to pass to CouchDB when creating this database. */
  options?: DatabaseCreateParams

  /** Documents that should exactly match. */
  documents?: { [id: string]: object }

  /** Documents that we should create, unless they already exist. */
  templates?: { [id: string]: object }

  /** Used for replicator filtering, in addition to the wallet name. */
  tags?: Array<`#${string}`>

  /** @deprecated Adds '#archived' to default tag list. */
  ignoreMissing?: boolean

  /** @deprecated Put this in the options instead. */
  replicatorSetup?: SyncedDocument<ReplicatorSetupDocument>
}

export interface SetupDatabaseOptions {
  /**
   * The couch cluster name the current client is connected to,
   * as described in the replicator setup document.
   * This controls which databases and replications we create.
   * Falls back to "default" if missing:
   */
  currentCluster?: string

  /**
   * Describes which database and replications should exist
   * on each cluster
   */
  replicatorSetup?: SyncedDocument<ReplicatorSetupDocument>

  /**
   * The setup routine will subscribe to the changes feed if
   * the setup includes an `onChange` callback or synced documents.
   * This option disables watching, performing a one-time sync instead.
   */
  disableWatching?: boolean

  /**
   * Don't create databases, design documents, or replications,
   * but do print messages.
   */
  dryRun?: boolean

  /**
   * Do not do any setup or replication work.
   */
  syncOnly?: boolean

  /** Logs status messages whenever we write things to Couch. */
  log?: (message: string) => void

  /** Logs error messages whenever something goes wrong. */
  onError?: (error: unknown) => void
}

/**
 * Ensures that the requested database exists in CouchDB.
 *
 * Returns a cleanup function, which removes any background tasks.
 */
export async function setupDatabase(
  connectionOrUri: nano.ServerScope | string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions = {}
): Promise<() => void> {
  const { name, onChange, syncedDocuments = [] } = setupInfo
  const {
    currentCluster,
    disableWatching = false,
    log = console.log,
    replicatorSetup = setupInfo.replicatorSetup,
    syncOnly = false,
    onError = error => {
      log(`Error while maintaining database "${name}": ${String(error)})`)
    }
  } = opts
  const connection =
    typeof connectionOrUri === 'string'
      ? nano(connectionOrUri)
      : connectionOrUri

  // Run the setup once to ensure the database exists:
  if (!syncOnly) await doSetup(connection, setupInfo, opts)
  const db = connection.db.use(name)

  // Should we sync documents?
  const { exists } = clusterHasDatabase(
    replicatorSetup?.doc,
    currentCluster,
    setupInfo
  )
  if (!exists) return () => {}

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
): Promise<void> {
  const { documents = {}, name, options, templates = {} } = setupInfo
  const {
    currentCluster,
    dryRun = false,
    log = console.log,
    replicatorSetup = setupInfo.replicatorSetup
  } = opts
  const prefix = dryRun ? 'dry-run: ' : ''

  // Bail out if the current cluster doesn't have this database:
  const { exists, replicated } = clusterHasDatabase(
    replicatorSetup?.doc,
    currentCluster,
    setupInfo
  )
  if (!exists) return

  // Create the database if needed:
  const existingInfo = await connection.db.get(name).catch(error => {
    if (asMaybeNotFoundError(error) == null) throw error
  })
  if (existingInfo == null) {
    log(`${prefix}Creating database "${name}".`)

    // Bail out (with logs) if this is a dry-run:
    if (dryRun) {
      const docs = [...Object.keys(documents), ...Object.keys(templates)]
      for (const id of docs) {
        log(`${prefix}Writing document "${id}" in database "${name}".`)
      }
      return
    }

    await connection.db.create(name, options).catch(error => {
      if (asMaybeExistsError(error) == null) throw error
    })
  }
  const db: DocumentScope<unknown> = connection.db.use(name)

  // Update documents:
  for (const id of Object.keys(documents)) {
    const { _id, _rev, ...rest } = await db.get(id).catch(error => {
      if (asMaybeNotFoundError(error) == null) throw error
      return { _id: id, _rev: undefined }
    })

    if (!matchJson(documents[id], rest)) {
      log(`${prefix}Writing document "${id}" in database "${name}".`)
      if (dryRun) continue
      await db.insert({ _id, _rev, ...documents[id] })
    }
  }

  // Create template documents:
  for (const id of Object.keys(templates)) {
    const { _id, _rev } = await db.get(id).catch(error => {
      if (asMaybeNotFoundError(error) == null) throw error
      return { _id: id, _rev: undefined }
    })

    if (_rev == null) {
      log(`${prefix}Writing document "${id}" in database "${name}".`)
      if (dryRun) continue
      await db.insert({ _id, ...templates[id] })
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
          replicatorSetup?.doc,
          currentCluster,
          currentUsername,
          setupInfo
        )
      },
      opts
    )
  }
}
