export type PeriodicMonth = 'month' | 'quarter' | 'half-year' | 'year'

/**
 * Picks the nearest month to the given date, along with a descriptive string,
 * rounding up or down as specified.
 */
export function pickPeriodicMonth(
  date: Date,
  period: PeriodicMonth,
  roundUp: boolean
): [Date, string] {
  switch (period) {
    case 'month': {
      const out = pickMonth(date, 1, roundUp)
      return [out, out.toISOString().slice(0, 7)]
    }
    case 'quarter': {
      const out = pickMonth(date, 3, roundUp)
      const year = out.getUTCFullYear()
      const quarter = 1 + out.getUTCMonth() / 3
      return [out, `${year}-q${quarter}`]
    }
    case 'half-year': {
      const out = pickMonth(date, 6, roundUp)
      const year = out.getUTCFullYear()
      const half = 1 + out.getUTCMonth() / 6
      return [out, `${year}-h${half}`]
    }
    case 'year': {
      const out = pickMonth(date, 12, roundUp)
      const year = out.getUTCFullYear()
      return [out, `${year}`]
    }
  }
}

/**
 * Picks the nearest month to the given date,
 * rounding up or down as specified.
 */
function pickMonth(date: Date, months: number, roundUp: boolean): Date {
  const year = date.getUTCFullYear()
  const bias = roundUp ? 1 : 0
  const month = months * (bias + Math.floor(date.getUTCMonth() / months))
  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
}
