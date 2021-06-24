import { DocumentScope, MangoSelector } from 'nano'

/**
 * Iterate over every document in a couch database.
 */
export async function forEachDocument(
  db: DocumentScope<any>,
  callback: (document: unknown) => void | Promise<void>,
  opts: {
    selector?: MangoSelector
  } = {}
): Promise<void> {
  const { selector = {} } = opts

  let bookmark: string | undefined
  while (true) {
    const results = await db.find({ bookmark, limit: 1000, selector })
    if (results.docs.length === 0) break
    for (const row of results.docs) await callback(row)
    bookmark = results.bookmark
  }
}
