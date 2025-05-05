import nano, { DatabaseCreateParams, DocumentScope } from 'nano'

import { matchJson } from '../util/match-json'
import {
  asMaybeExistsError,
  asMaybeNotFoundError
} from './couch-error-cleaners'
import { connectCouch, CouchPool } from './couch-pool'
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

  /** Use this cluster for watching for changes. */
  watchCluster?: string

  /** Logs error messages whenever something goes wrong. */
  onError?: (error: unknown) => void

  /**
   * @deprecated Pass a CouchPool to `setupDatabase` instead.
   * The couch cluster name the current client is connected to,
   * as described in the replicator setup document.
   * This controls which databases and replications we create.
   * Falls back to "default" if missing:
   */
  currentCluster?: string
}

/**
 * Ensures that the requested database exists in CouchDB.
 *
 * The first parameter should be a `CouchPool` object.
 * Passing anything else is deprecated.
 *
 * Returns a cleanup function, which removes any background tasks.
 */
export async function setupDatabase(
  poolOrConnection: CouchPool | nano.ServerScope | string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions = {}
): Promise<() => void> {
  const { name, onChange, syncedDocuments = [] } = setupInfo
  const {
    currentCluster = 'default',
    disableWatching = false,
    log = console.log,
    replicatorSetup = setupInfo.replicatorSetup,
    syncOnly = false,
    watchCluster,
    onError = error => {
      log(`Error while maintaining database "${name}": ${String(error)})`)
    }
  } = opts

  const pool =
    typeof poolOrConnection === 'string' || 'relax' in poolOrConnection
      ? connectCouch(currentCluster, { [currentCluster]: poolOrConnection })
      : poolOrConnection

  // Run the setup once to ensure the database exists:
  if (!syncOnly) await doSetups(pool, setupInfo, opts)
  const connection =
    watchCluster == null ? pool.default : pool.connect(watchCluster)
  const db = connection.use(name)

  // Should we sync documents?
  const { exists } = clusterHasDatabase(
    replicatorSetup?.doc,
    watchCluster ?? pool.defaultName,
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
        doSetups(pool, setupInfo, opts).catch(onError)
      })
    )
  }

  return () => cleanups.forEach(cleanup => cleanup())
}

async function doSetups(
  pool: CouchPool,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions
): Promise<void> {
  const { replicatorSetup = setupInfo.replicatorSetup } = opts

  for (const clusterName of pool.clusterNames) {
    // Bail out if the current cluster doesn't have this database:
    const { exists, replicated } = clusterHasDatabase(
      replicatorSetup?.doc,
      clusterName,
      setupInfo
    )

    if (exists) {
      await doSetup(pool, clusterName, setupInfo, opts)
      if (replicated) {
        await doReplication(pool, clusterName, setupInfo, opts)
      }
    }
  }
}

/**
 * Performs the actual work of database setup.
 * This is a one-shot process, and doesn't subscribe to anything.
 */
async function doSetup(
  pool: CouchPool,
  clusterName: string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions
): Promise<void> {
  const { documents = {}, name, options, templates = {} } = setupInfo
  const { dryRun = false, log = console.log } = opts
  const prefix = dryRun ? 'dry-run: ' : ''

  const connection = pool.maybeConnect(clusterName)
  if (connection == null) return

  // Create the database if needed:
  const existingInfo = await connection.db.get(name).catch(error => {
    if (asMaybeNotFoundError(error) == null) throw error
  })
  if (existingInfo == null) {
    log(`${prefix}Creating database "${name}" on cluster "${clusterName}".`)

    // Bail out (with logs) if this is a dry-run:
    if (dryRun) {
      const docs = [...Object.keys(documents), ...Object.keys(templates)]
      for (const id of docs) {
        log(
          `${prefix}Writing document "${id}" in database "${name}" on cluster "${clusterName}".`
        )
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
      log(
        `${prefix}Writing document "${id}" in database "${name}" on cluster "${clusterName}".`
      )
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
      log(
        `${prefix}Writing document "${id}" in database "${name}" on cluster "${clusterName}".`
      )
      if (dryRun) continue
      await db.insert({ _id, ...templates[id] })
    }
  }
}

async function doReplication(
  pool: CouchPool,
  clusterName: string,
  setupInfo: DatabaseSetup,
  opts: SetupDatabaseOptions
): Promise<void> {
  const replicatorSetup = mergeReplicatorCredentials(
    pool,
    opts.replicatorSetup?.doc ?? setupInfo.replicatorSetup?.doc
  )

  const connection = pool.maybeConnect(clusterName)
  if (connection == null) return

  // Figure out the current username:
  const credential = pool.getCredential(clusterName)
  const currentUsername =
    credential?.username ??
    // We can remove this slow fallback in the next breaking release,
    // since this will only happen when putting a `nano.ServerScope` into
    // CouchPool, which is deprecated:
    (await connection.session()).userCtx.name

  // Set up replication:
  const documents = makeReplicatorDocuments(
    replicatorSetup,
    clusterName,
    currentUsername,
    setupInfo
  )
  await doSetup(pool, clusterName, { name: '_replicator', documents }, opts)
}

/**
 * Adds credentials to a replicator setup document.
 *
 * The replicator document can contain credentials, but that's deprecated.
 * Copy credentials from the CouchPool to the replicator document,
 * so we remain backwards-compatible.
 */
function mergeReplicatorCredentials(
  pool: CouchPool,
  doc: ReplicatorSetupDocument | undefined
): ReplicatorSetupDocument {
  const merged: ReplicatorSetupDocument = { clusters: {} }
  if (doc == null) return merged

  for (const name of Object.keys(doc.clusters)) {
    const row = doc.clusters[name]
    merged.clusters[name] = row

    // If we have credentials in the pool, use those:
    const credential = pool.getCredential(name)
    if (credential != null) {
      const { url, username, password } = credential
      const basicAuth =
        username != null && password != null
          ? btoa(`${username}:${password}`)
          : undefined
      merged.clusters[name] = { ...row, url, basicAuth }
    }
  }

  return merged
}
