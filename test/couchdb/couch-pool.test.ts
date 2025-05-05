import { expect } from 'chai'
import { describe } from 'mocha'

import { connectCouch } from '../../src'

describe('CouchPool', function () {
  it('returns credentials', function () {
    const pool = connectCouch('logs', {
      production: {
        url: 'https://production.example.com:6984/',
        username: 'prod-u',
        password: 'prod-p'
      },
      logs: {
        url: 'https://logsu:logsp@logs.example.com:6984/'
      },
      backup: 'https://backu:backp@backup.example.com:6984/'
    })

    expect(pool.defaultName).equals('logs')
    expect(pool.clusterNames).deep.equals(['production', 'logs', 'backup'])
    expect(pool.getCredential('missing')).equals(undefined)

    expect(pool.getCredential('production')).deep.equals({
      url: 'https://production.example.com:6984/',
      username: 'prod-u',
      password: 'prod-p'
    })

    expect(pool.getCredential('logs')).deep.equals({
      url: 'https://logs.example.com:6984/',
      username: 'logsu',
      password: 'logsp'
    })

    expect(pool.getCredential('backup')).deep.equals({
      url: 'https://backup.example.com:6984/',
      username: 'backu',
      password: 'backp'
    })
  })
})
