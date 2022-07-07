import { DocumentViewParams } from 'nano'

/**
 * The common subset of `DocumentViewResponse` and `DocumentListResponse`.
 */
interface CommonViewResponse {
  rows: Array<{ id: string; key: string; doc?: unknown }>
}

/**
 * Stream the results of a view.
 *
 * This uses the callback function to read results one batch at a time,
 * and then streams those results out.
 */
export async function* viewToStream(
  callback: (params: DocumentViewParams) => Promise<CommonViewResponse>,
  opts: { limit?: number } = {}
): AsyncIterableIterator<unknown> {
  const { limit = 2048 } = opts

  let lastRow: { id: string; key: string } | undefined
  while (true) {
    const params: DocumentViewParams = {
      include_docs: true,
      limit
    }
    if (lastRow != null) {
      params.skip = 1
      params.start_key = lastRow.key
      params.start_key_doc_id = lastRow.id
    }
    const { rows } = await callback(params)
    for (const row of rows) yield row.doc

    // Set up the next iteration:
    if (rows.length < limit) break
    lastRow = rows[rows.length - 1]
  }
}
