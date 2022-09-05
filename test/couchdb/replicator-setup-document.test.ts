import { expect } from 'chai'
import { describe, it } from 'mocha'

import { asReplicatorSetupDocument } from '../../src/couchdb/replicator-setup-document'

describe('asReplicatorSetupDocument', function () {
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
          exclude: undefined,
          include: ['logs-*'],
          pullFrom: ['c'],
          pushTo: ['b', 'c']
        },
        b: {
          url: 'https://b.example.com',
          basicAuth: undefined,
          exclude: undefined,
          include: undefined,
          pullFrom: ['a', 'c'],
          pushTo: ['c']
        },
        c: {
          url: 'https://c.example.com',
          basicAuth: undefined,
          exclude: ['admins'],
          include: undefined,
          pullFrom: ['a'],
          pushTo: ['b']
        }
      }
    })
  })
})
