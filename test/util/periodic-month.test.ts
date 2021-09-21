import { expect } from 'chai'
import { describe, it } from 'mocha'

import { PeriodicMonth, pickPeriodicMonth } from '../../src/util/periodic-month'

interface Case {
  period: PeriodicMonth
  name: string
  date: string
}

describe('pick periodic month', function () {
  // Names for January:
  const startCases: Case[] = [
    { period: 'month', name: '2021-01', date: '2021-01-01' },
    { period: 'quarter', name: '2021-q1', date: '2021-01-01' },
    { period: 'half-year', name: '2021-h1', date: '2021-01-01' },
    { period: 'year', name: '2021', date: '2021-01-01' }
  ]

  it('rounds up from Christmas to January', function () {
    const start = new Date('2020-12-25')
    for (const { period, name, date } of startCases) {
      expect(pickPeriodicMonth(start, period, true)).deep.equals([
        new Date(date),
        name
      ])
    }
  })

  it('stays in January when rounding down', function () {
    const start = new Date('2021-01-01')
    for (const { period, name, date } of startCases) {
      expect(pickPeriodicMonth(start, period, false)).deep.equals([
        new Date(date),
        name
      ])
    }
  })

  it('rounds up from January to a period boundary', function () {
    const upCases: Case[] = [
      { period: 'month', name: '2021-02', date: '2021-02-01' },
      { period: 'quarter', name: '2021-q2', date: '2021-04-01' },
      { period: 'half-year', name: '2021-h2', date: '2021-07-01' },
      { period: 'year', name: '2022', date: '2022-01-01' }
    ]

    const start = new Date('2021-01-01')
    for (const { period, name, date } of upCases) {
      expect(pickPeriodicMonth(start, period, true)).deep.equals([
        new Date(date),
        name
      ])
    }
  })

  it('rounds down from Christmas to a period boundary', function () {
    const downCases: Case[] = [
      { period: 'month', name: '2020-12', date: '2020-12-01' },
      { period: 'quarter', name: '2020-q4', date: '2020-10-01' },
      { period: 'half-year', name: '2020-h2', date: '2020-07-01' },
      { period: 'year', name: '2020', date: '2020-01-01' }
    ]

    const start = new Date('2020-12-25')
    for (const { period, name, date } of downCases) {
      expect(pickPeriodicMonth(start, period, false)).deep.equals([
        new Date(date),
        name
      ])
    }
  })
})
