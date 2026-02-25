import { expect } from 'chai'
import { asNumber, asObject, asOptional, asString } from 'cleaners'
import { describe, it } from 'mocha'

import { syncedDocument } from '../../src/couchdb/synced-document'

const asConfig = asObject({
  name: asOptional(asString, 'default'),
  count: asOptional(asNumber, 0)
})

type Config = ReturnType<typeof asConfig>

function makeMockDb(
  store: { [id: string]: { _rev: string; [key: string]: unknown } } = {}
): any {
  let revCounter = 0
  return {
    get: async (id: string) => {
      const doc = store[id]
      if (doc == null)
        throw Object.assign(new Error('not_found'), { error: 'not_found' })
      return { _id: id, ...doc }
    },
    insert: async (doc: {
      _id: string
      _rev?: string
      [key: string]: unknown
    }) => {
      const rev = `${++revCounter}-abc`
      const { _id, ...rest } = doc
      store[_id] = { ...rest, _rev: rev }
      return { ok: true, id: _id, rev }
    }
  }
}

describe('syncedDocument', function () {
  it('initializes with fallback from cleaner({})', function () {
    const doc = syncedDocument('config', asConfig)
    expect(doc.doc).deep.equals({ name: 'default', count: 0 })
    expect(doc.rev).equals(undefined)
    expect(doc.id).equals('config')
  })

  it('creates missing documents on sync', async function () {
    const doc = syncedDocument('config', asConfig)
    const db = makeMockDb()

    await doc.sync(db)

    expect(doc.doc).deep.equals({ name: 'default', count: 0 })
    expect(doc.rev).to.be.a('string')
  })

  it('reads existing clean documents', async function () {
    const store = {
      config: { _rev: '1-existing', name: 'prod', count: 42 }
    }
    const doc = syncedDocument('config', asConfig)
    const db = makeMockDb(store)

    await doc.sync(db)

    expect(doc.doc).deep.equals({ name: 'prod', count: 42 })
    expect(doc.rev).equals('1-existing')
  })

  it('repairs dirty documents (extra fields)', async function () {
    const store = {
      config: { _rev: '1-existing', name: 'prod', count: 42, extra: 'junk' }
    }
    const doc = syncedDocument('config', asConfig)
    const db = makeMockDb(store)

    await doc.sync(db)

    expect(doc.doc).deep.equals({ name: 'prod', count: 42 })
    expect(doc.rev).not.equals('1-existing')
  })

  it('fires onChange when document is created', async function () {
    const doc = syncedDocument('config', asConfig)
    const db = makeMockDb()
    const changes: Config[] = []
    doc.onChange(value => changes.push(value))

    await doc.sync(db)

    expect(changes).to.have.length(1)
    expect(changes[0]).deep.equals({ name: 'default', count: 0 })
  })

  it('does not fire onChange when nothing changed', async function () {
    const store = {
      config: { _rev: '1-existing', name: 'default', count: 0 }
    }
    const doc = syncedDocument('config', asConfig)
    const db = makeMockDb(store)
    await doc.sync(db)

    const changes: Config[] = []
    doc.onChange(value => changes.push(value))
    await doc.sync(db)

    expect(changes).to.have.length(0)
  })

  describe('cleanFailStrategy = "reset" (default)', function () {
    it('resets to fallback when document fails cleaner', async function () {
      const store = {
        config: { _rev: '1-existing', name: 'prod', count: 42 }
      }
      const doc = syncedDocument('config', asConfig)
      const db = makeMockDb(store)

      await doc.sync(db)
      expect(doc.doc).deep.equals({ name: 'prod', count: 42 })

      // Corrupt the document:
      store.config = {
        _rev: store.config._rev,
        name: 999 as any,
        count: 'bad' as any
      }

      await doc.sync(db)
      expect(doc.doc).deep.equals({ name: 'default', count: 0 })
    })
  })

  describe('cleanFailStrategy = "preserve"', function () {
    it('preserves last good value when document fails cleaner', async function () {
      const store = {
        config: { _rev: '1-existing', name: 'prod', count: 42 }
      }
      const doc = syncedDocument('config', asConfig, {
        cleanFailStrategy: 'preserve'
      })
      const db = makeMockDb(store)

      await doc.sync(db)
      expect(doc.doc).deep.equals({ name: 'prod', count: 42 })

      store.config = {
        _rev: store.config._rev,
        name: 999 as any,
        count: 'bad' as any
      }

      await doc.sync(db)
      expect(doc.doc).deep.equals({ name: 'prod', count: 42 })
    })

    it('falls back to cleaner({}) when no previous good state exists', async function () {
      const store = {
        config: { _rev: '1-existing', name: 999 as any, count: 'bad' as any }
      }
      const doc = syncedDocument('config', asConfig, {
        cleanFailStrategy: 'preserve'
      })
      const db = makeMockDb(store)

      await doc.sync(db)
      expect(doc.doc).deep.equals({ name: 'default', count: 0 })
    })
  })

  describe('onCleanFail callback', function () {
    it('fires with the error when the cleaner fails', async function () {
      const store = {
        config: { _rev: '1-existing', name: 999 as any, count: 'bad' as any }
      }
      const errors: unknown[] = []
      const doc = syncedDocument('config', asConfig, {
        onCleanFail: error => errors.push(error)
      })
      const db = makeMockDb(store)

      await doc.sync(db)

      expect(errors).to.have.length(1)
      expect(errors[0]).to.be.an('error')
    })

    it('does not fire when the cleaner succeeds', async function () {
      const store = {
        config: { _rev: '1-existing', name: 'prod', count: 42 }
      }
      const errors: unknown[] = []
      const doc = syncedDocument('config', asConfig, {
        onCleanFail: error => errors.push(error)
      })
      const db = makeMockDb(store)

      await doc.sync(db)

      expect(errors).to.have.length(0)
    })
  })
})
