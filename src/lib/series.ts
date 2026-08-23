import type { ParsedMarket } from '@/lib/hyperliquid/types'
import { parseExpiry } from '@/lib/marketFormat'

/**
 * A "series" is every tradable market on the same underlying, period and
 * expiry — on mainnet today that is one standalone binary ("BTC above X")
 * plus the named outcomes of one price-bucket question, all settling at the
 * same 06:00 UTC timestamp. The UI groups them into one card / one strip.
 */
export interface SeriesRow {
  market: ParsedMarket
  /** 'below' | 'between' | 'above' */
  kind: 'below' | 'between' | 'above' | 'other'
  /** Lower/upper bound used for ladder sorting and labels */
  lo?: number
  hi?: number
  /** Row label without the underlying, e.g. "above $76,101" */
  label: string
  isBinary: boolean
}

export interface Series {
  key: string
  underlying: string
  period: string
  expiry: string
  /** Ladder-sorted rows (ascending by price level) */
  rows: SeriesRow[]
  /** Whether the series contains a bucket question (rows that sum to ~100%) */
  hasBuckets: boolean
}

const fmtUsd = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 })

export function seriesKey(m: ParsedMarket): string {
  return m.underlying && m.period && m.expiry
    ? `${m.underlying}:${m.period}:${m.expiry}`
    : `single:${m.outcomeId}`
}

export function toSeriesRow(m: ParsedMarket): SeriesRow {
  if (m.class === 'priceBinary') {
    return { market: m, kind: 'above', lo: m.targetPrice, label: `above ${fmtUsd(m.targetPrice)}`, isBinary: true }
  }
  if (m.class === 'priceBucket' && m.priceThresholds?.length && m.bucketIndex != null && m.bucketIndex >= 0) {
    const t = m.priceThresholds
    const i = m.bucketIndex
    if (i === 0) return { market: m, kind: 'below', hi: t[0], label: `below ${fmtUsd(t[0])}`, isBinary: false }
    if (i >= t.length) return { market: m, kind: 'above', lo: t[t.length - 1], label: `above ${fmtUsd(t[t.length - 1])}`, isBinary: false }
    return { market: m, kind: 'between', lo: t[i - 1], hi: t[i], label: `${fmtUsd(t[i - 1])}–${fmtUsd(t[i])}`, isBinary: false }
  }
  return { market: m, kind: 'other', label: m.name, isBinary: false }
}

/** Sort key along the price ladder: "below X" sorts by X, "between" by lo, "above" by lo (just after an equal "between" lo). */
function ladderValue(r: SeriesRow): number {
  if (r.kind === 'below') return (r.hi ?? 0) - 1e-9
  if (r.kind === 'between') return r.lo ?? 0
  if (r.kind === 'above') return (r.lo ?? 0) + 1e-9
  return Number.POSITIVE_INFINITY
}

export function groupBySeries(markets: ParsedMarket[]): Series[] {
  const map = new Map<string, Series>()
  for (const m of markets) {
    const key = seriesKey(m)
    let s = map.get(key)
    if (!s) {
      s = { key, underlying: m.underlying, period: m.period, expiry: m.expiry, rows: [], hasBuckets: false }
      map.set(key, s)
    }
    s.rows.push(toSeriesRow(m))
    if (m.class === 'priceBucket') s.hasBuckets = true
  }
  for (const s of map.values()) s.rows.sort((a, b) => ladderValue(a) - ladderValue(b))
  return [...map.values()]
}

/** "Where will BTC settle on 24 Aug, 2:00 PM?" */
export function seriesTitle(s: Series): string {
  const d = parseExpiry(s.expiry)
  const when = d
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        .replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')
    : ''
  if (!s.underlying) return s.rows[0]?.market.name ?? ''
  return when ? `Where will ${s.underlying} settle on ${when}?` : `Where will ${s.underlying} settle?`
}
