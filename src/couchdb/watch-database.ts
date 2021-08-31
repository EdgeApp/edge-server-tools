import { DocumentScope } from 'nano'

import { SyncedDocument } from './synced-document'

export interface CouchChange {
  seq?: string
  id: string
  changes: Array<{ rev: string }>
  doc?: unknown
}

/**
 * Subscribes to a database change feed,
 * and uses that to trigger updates on an array of document watchers.
 */
export async function watchDatabase(
  db: DocumentScope<unknown>,
  opts: {
    onChange?: (change: CouchChange) => void
    onError?: (error: unknown) => void
    syncedDocuments?: Array<SyncedDocument<unknown>>
  } = {}
): Promise<void> {
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
  for (const doc of syncedDocuments) {
    await doc.sync(db).catch(onError)
  }
}
