import { expect } from 'chai'
import { describe, it } from 'mocha'

import {
  AggregateError,
  asMaybeAggregateError,
  promiseAny,
  stringifyError
} from '../../src/util/aggregate-error'

describe('AggregateError', function () {
  it('pretty-prints', function () {
    const aggregate = new AggregateError([
      new Error('boom'),
      new AggregateError([new Error('bam'), new Error('pow')], 'nested')
    ])
    expect(stringifyError(aggregate)).equals(
      'AggregateError\n' +
        '- Error: boom\n' +
        '- AggregateError: nested\n' +
        '  - Error: bam\n' +
        '  - Error: pow'
    )
  })

  it('works with the promiseAny ponyfill', async function () {
    await promiseAny([
      Promise.reject(new Error('pow')),
      Promise.reject(new Error('bam'))
    ]).then(
      async () => {
        throw new Error('Expected promiseAny to throw')
      },
      error => {
        expect(asMaybeAggregateError(error)).not.equals(undefined)
      }
    )
  })
})
