import { expect } from 'chai'
import { describe, it } from 'mocha'

import { matchJson } from '../src/util/match-json'

describe('matchJson', function () {
  it('matches similar JSON structures', function () {
    expect(
      matchJson(
        { object: { a: 1, b: 'string' }, array: [false, null] },
        { array: [false, null], object: { b: 'string', a: 1 } }
      )
    ).equals(true)
  })

  it('rejects unequal JSON arrays', function () {
    expect(matchJson([1, 2], [1, 2, 3])).equals(false)
    expect(matchJson([1, 2], [1, 3])).equals(false)
    expect(matchJson([1, 2], { 1: 1, 2: 2 })).equals(false)
    expect(matchJson({ 1: 1, 2: 2 }, [1, 2])).equals(false)
    expect(matchJson([1, 2], null)).equals(false)
  })

  it('rejects unequal JSON objects', function () {
    expect(matchJson({ a: 1, b: 2 }, { a: 1 })).equals(false)
    expect(matchJson({ a: 1 }, { a: 1, b: 2 })).equals(false)
    expect(matchJson({ a: 1, b: 2 }, { a: 1, b: 3 })).equals(false)
    expect(matchJson({ a: 1, b: 2 }, null)).equals(false)
  })

  it('treats undefined and missing equally', function () {
    expect(matchJson({ a: 1 }, { a: 1, c: undefined })).equals(true)
    expect(matchJson({ a: 1, b: undefined }, { a: 1 })).equals(true)
    expect(matchJson({ a: 1, c: 1 }, { a: 1, c: undefined })).equals(false)
  })
})
