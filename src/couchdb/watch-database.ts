import { DocumentScope } from 'nano'

import { SyncedDocument } from './synced-document'

export interface CouchChange {
  seq?: string
  id: string
  changes: Array<{ rev: string }>
  doc?: unknown
}

export interface WatchDatabaseOptions {
  /** Documents to automatically keep up-to-date. */
  syncedDocuments?: Array<SyncedDocument<unknown>>

  /** Provides low-level access to the change feed. */
  onChange?: (change: CouchChange) => void

  /** Called if there is an error in the watching loop. */
  onError?: (error: unknown) => void
}

/**
 * Subscribes to a database change feed,
 * and uses that to trigger updates on an array of document watchers.
 */
export async function watchDatabase(
  db: DocumentScope<unknown>,
  opts: WatchDatabaseOptions = {}
): Promise<() => void> {
  const { onChange = () => {}, onError = () => {}, syncedDocuments = [] } = opts

  // Watch the database for changes:
  db.changesReader
    .start({ since: 'now' })
    .on('change', (change: CouchChange): void => {
      for (const doc of syncedDocuments) {
        if (doc.id === change.id) {
          doc.sync(db).catch(onError)
        }
      }
      onChange(change)
    })
    .on('error', onError)

  // Do an initial sync:
  await Promise.all(syncedDocuments.map(async doc => await doc.sync(db)))

  return () => db.changesReader.stop()
}
