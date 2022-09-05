import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  asReplicatorSetupDocument,
  makeReplicatorDocuments
} from '../../src/couchdb/replicator-setup-document'

describe('asReplicatorSetupDocument', function () {
  const replicatorSetup = asReplicatorSetupDocument({
    clusters: {
      a: {
        url: 'https://a.example.com',
        pushTo: ['b'],
        pullFrom: ['c']
      },
      b: {
        url: 'https://b.example.com',
        exclude: ['#secret']
      },
      c: {
        url: 'https://c.example.com',
        include: ['example-*']
      }
    }
  })

  it('makeReplicatorDocuments works with pushes & pulls', function () {
    expect(
      makeReplicatorDocuments(replicatorSetup, 'a', 'admin', {
        name: 'example-db',
        options: { partitioned: true }
      })
    ).deep.equals({
      'example-db.to.b': {
        continuous: true,
        create_target: true,
        create_target_params: {
          partitioned: true
        },
        owner: 'admin',
        source: 'https://a.example.com/example-db',
        target: 'https://b.example.com/example-db'
      },
      'example-db.from.c': {
        continuous: true,
        create_target: false,
        owner: 'admin',
        source: 'https://c.example.com/example-db',
        target: 'https://a.example.com/example-db'
      }
    })
  })

  it('makeReplicatorDocuments works with filtering', function () {
    expect(
      makeReplicatorDocuments(replicatorSetup, 'a', 'admin', {
        name: 'passwords',
        tags: ['#secret']
      })
    ).deep.equals({})
  })

  it('upgrades legacy documents', function () {
    const doc = {
      clusters: {
        a: {
          url: 'https://a.example.com',
          mode: 'source',
          include: ['logs-*']
        },
        b: {
          url: 'https://b.example.com',
          mode: 'target',
          exclude: 'bogus'
        },
        c: {
          url: 'https://c.example.com',
          mode: 'both',
          exclude: ['admins']
        },
        bogus: ''
      }
    }

    expect(asReplicatorSetupDocument(doc)).deep.equals({
      clusters: {
        a: {
          url: 'https://a.example.com',
          basicAuth: undefined,
          exclude: ['#archived'],
          include: ['logs-*'],
          localOnly: undefined,
          pullFrom: ['c'],
          pushTo: ['b', 'c']
        },
        b: {
          url: 'https://b.example.com',
          basicAuth: undefined,
          exclude: ['#archived'],
          include: undefined,
          localOnly: undefined,
          pullFrom: ['a', 'c'],
          pushTo: ['c']
        },
        c: {
          url: 'https://c.example.com',
          basicAuth: undefined,
          exclude: ['admins'],
          include: undefined,
          localOnly: undefined,
          pullFrom: ['a'],
          pushTo: ['b']
        }
      }
    })
  })
})
