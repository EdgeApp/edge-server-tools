import { expect } from 'chai'
import { describe, it } from 'mocha'
import { ServerScope } from 'nano'

import { CouchPool } from '../../src/couchdb/couch-pool'
import { setupDatabase } from '../../src/couchdb/setup-database'

interface FakeDoc {
  _id: string
  _rev: string
  [key: string]: unknown
}

interface FakeCluster {
  /** The documents in the cluster's only database. */
  docs: { [id: string]: FakeDoc }

  /** Every document passed to `insert`, in order. */
  writes: Array<{ _id: string; _rev?: string }>

  /** Runs at the start of each write, before the cluster checks the rev. */
  beforeWrite?: () => void

  server: ServerScope
}

/**
 * Makes an error shaped like the ones nano throws.
 */
function couchError(statusCode: number, error: string, reason: string): Error {
  return Object.assign(new Error(reason), { statusCode, error, reason })
}

/**
 * Pretends to be a CouchDB cluster that already has the database.
 * Like CouchDB, it rejects a write unless it carries the current `_rev`.
 */
function makeFakeCluster(): FakeCluster {
  let revCount = 0

  const db = {
    get: async (id: string) => {
      const doc = cluster.docs[id]
      if (doc == null) throw couchError(404, 'not_found', 'missing')
      return { ...doc }
    },

    insert: async (doc: { _id: string; _rev?: string }) => {
      cluster.writes.push(doc)
      cluster.beforeWrite?.()

      const { _id, _rev, ...rest } = doc
      if (cluster.docs[_id]?._rev !== _rev) {
        throw couchError(409, 'conflict', 'Document update conflict.')
      }
      const rev = `${++revCount}-fake`
      cluster.docs[_id] = { _id, _rev: rev, ...rest }
      return { ok: true, id: _id, rev }
    }
  }

  const cluster: FakeCluster = {
    docs: {},
    writes: [],
    server: {
      db: {
        get: async (name: string) => ({ db_name: name }),
        use: () => db
      },
      use: () => db
    } as any
  }
  return cluster
}

/**
 * Puts fake clusters in a pool, with the first one as the default.
 */
function makeFakePool(clusters: { [name: string]: FakeCluster }): CouchPool {
  const clusterNames = Object.keys(clusters)
  const maybeConnect = (name: string): ServerScope | undefined =>
    clusters[name]?.server
  const connect = (name: string): ServerScope => clusters[name].server

  return {
    default: connect(clusterNames[0]),
    defaultName: clusterNames[0],
    clusterNames,
    connect,
    getCredential: () => undefined,
    maybeConnect
  }
}

/**
 * Waits for a promise to fail, and returns the error.
 */
async function getError(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => {
      throw new Error('Expected a failure')
    },
    (error: unknown) => error
  )
}

describe('setupDatabase', function () {
  const id = '_design/example'
  const designDoc = {
    language: 'javascript',
    views: { byDate: { map: 'function (doc) { emit(doc.date) }' } }
  }
  const setup = { name: 'example', documents: { [id]: designDoc } }

  it('accepts a document that replication delivers during setup', async function () {
    const backup = makeFakeCluster()
    const logs1 = makeFakeCluster()
    const logs5 = makeFakeCluster()

    // Replication copies the document from logs1 to logs5
    // after setup has read it on logs5, but before setup writes it:
    logs5.beforeWrite = () => {
      logs5.docs[id] = { ...logs1.docs[id] }
      logs5.beforeWrite = undefined
    }

    const logs: string[] = []
    await setupDatabase(makeFakePool({ backup, logs1, logs5 }), setup, {
      log: message => logs.push(message)
    })

    expect(logs5.docs[id]).deep.equals(logs1.docs[id])
    expect(logs5.writes).has.length(1)
    expect(logs).deep.equals([
      'Writing document "_design/example" in database "example" on cluster "backup".',
      'Writing document "_design/example" in database "example" on cluster "logs1".',
      'Writing document "_design/example" in database "example" on cluster "logs5".'
    ])
  })

  it('writes again over a different document that arrives during setup', async function () {
    const cluster = makeFakeCluster()
    cluster.beforeWrite = () => {
      cluster.docs[id] = { _id: id, _rev: '1-other', views: {} }
      cluster.beforeWrite = undefined
    }

    await setupDatabase(makeFakePool({ default: cluster }), setup, {
      log: () => {}
    })

    const { _id, _rev, ...rest } = cluster.docs[id]
    expect(rest).deep.equals(designDoc)
    expect(cluster.writes.map(doc => doc._rev)).deep.equals([
      undefined,
      '1-other'
    ])
  })

  it('gives up after repeated conflicts', async function () {
    const cluster = makeFakeCluster()
    let otherRevs = 0
    cluster.beforeWrite = () => {
      cluster.docs[id] = { _id: id, _rev: `${++otherRevs}-other`, views: {} }
    }

    const error = await getError(
      setupDatabase(makeFakePool({ default: cluster }), setup, {
        log: () => {}
      })
    )

    expect(error).has.property('error', 'conflict')
    expect(cluster.writes).has.length(5)
  })

  it('keeps a template document that arrives during setup', async function () {
    const cluster = makeFakeCluster()
    const replicated = { _id: 'settings', _rev: '1-other', mode: 'custom' }
    cluster.beforeWrite = () => {
      cluster.docs.settings = replicated
      cluster.beforeWrite = undefined
    }

    await setupDatabase(
      makeFakePool({ default: cluster }),
      { name: 'example', templates: { settings: { mode: 'default' } } },
      { log: () => {} }
    )

    expect(cluster.docs.settings).deep.equals(replicated)
    expect(cluster.writes).has.length(1)
  })

  it('does not retry other write errors', async function () {
    const cluster = makeFakeCluster()
    cluster.beforeWrite = () => {
      throw couchError(403, 'forbidden', 'Only admins may write here.')
    }

    const error = await getError(
      setupDatabase(makeFakePool({ default: cluster }), setup, {
        log: () => {}
      })
    )

    expect(error).has.property('error', 'forbidden')
    expect(cluster.writes).has.length(1)
  })

  it('only logs in a dry run', async function () {
    const cluster = makeFakeCluster()

    const logs: string[] = []
    await setupDatabase(makeFakePool({ default: cluster }), setup, {
      dryRun: true,
      log: message => logs.push(message)
    })

    expect(cluster.writes).has.length(0)
    expect(logs).deep.equals([
      'dry-run: Writing document "_design/example" in database "example" on cluster "default".'
    ])
  })
})
