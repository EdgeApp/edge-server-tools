import nano from 'nano'

export interface BulkGetRequestDoc {
  id: string
  rev?: string
}

export interface BulkGetResponse<T> {
  results: Array<{
    id: string
    docs: Array<{ ok: T } | { error: BulkGetError }>
  }>
}

export interface BulkGetError {
  id: string
  rev: string
  error: string
  reason: string
}

export async function bulkGet<T>(
  couchUri: string,
  couchDatabase: string,
  docs: BulkGetRequestDoc[]
): Promise<BulkGetResponse<T>> {
  const connection = nano(couchUri)

  return await connection.request({
    db: couchDatabase,
    method: 'post',
    path: '_bulk_get',
    body: { docs }
  })
}
