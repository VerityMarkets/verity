import type { MarketKind, ParsedMarket } from '@/lib/hyperliquid/types'
import { parseExpiry } from '@/lib/marketFormat'

/**
 * A "series" is a group of markets the UI shows on one card / one strip.
 *
 *  - price markets group by underlying · period · expiry — on mainnet that is
 *    one standalone binary ("BTC above X") plus the named outcomes of one
 *    price-bucket question, all settling at the same 06:00 UTC timestamp;
 *  - members of a multi-outcome question group by that question ("Cats" /
 *    "Draw" / "Humans");
 *  - everything else (standalone templates, hand-written prose markets) is its
 *    own single-row series.
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
  /** Ladder-sorted rows (ascending by price level) for price series; input order otherwise */
  rows: SeriesRow[]
  /** Whether the series contains a bucket question (rows that sum to ~100%) */
  hasBuckets: boolean
  /** Shape of the markets in this series (taken from the first row). */
  kind: MarketKind
  /** 'sports' | 'price' | 'economics' … when the deployer tagged it. */
  category?: string
  subCategory?: string
  /** Scheduled event start (`YYYYMMDD-HHMM` UTC) when distinct from `expiry`. */
  startsAt?: string
  /** Deployer venue tag; null for protocol series. */
  venue?: string | null
}

const fmtUsd = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 })
/** "$74.6k" — used where both bounds are shown and the exact values appear on neighbouring rows */
export const compactUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : fmtUsd(n)

export function seriesKey(m: ParsedMarket): string {
  if (m.kind === 'price' && m.underlying && m.period && m.expiry) {
    return `${m.underlying}:${m.period}:${m.expiry}`
  }
  if (m.questionId != null) return `q:${m.questionId}`
  return `single:${m.outcomeId}`
}

export function toSeriesRow(m: ParsedMarket): SeriesRow {
  if (m.class === 'priceBinary') {
    return { market: m, kind: 'above', lo: m.targetPrice, label: fmtUsd(m.targetPrice), isBinary: true }
  }
  if (m.class === 'priceBucket' && m.priceThresholds?.length && m.bucketIndex != null && m.bucketIndex >= 0) {
    const t = m.priceThresholds
    const i = m.bucketIndex
    if (i === 0) return { market: m, kind: 'below', hi: t[0], label: fmtUsd(t[0]), isBinary: false }
    if (i >= t.length) return { market: m, kind: 'above', lo: t[t.length - 1], label: fmtUsd(t[t.length - 1]), isBinary: false }
    return { market: m, kind: 'between', lo: t[i - 1], hi: t[i], label: `${compactUsd(t[i - 1])} ↔ ${compactUsd(t[i])}`, isBinary: false }
  }
  return { market: m, kind: 'other', label: m.name, isBinary: false }
}

/** Glyph for a row kind: ↓ below, ↑ above; 'between' carries ↔ inside its label. */
export function rowGlyph(kind: SeriesRow['kind']): string {
  return kind === 'below' ? '↓' : kind === 'above' ? '↑' : ''
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
      s = {
        key,
        underlying: m.underlying,
        period: m.period,
        expiry: m.expiry,
        rows: [],
        hasBuckets: false,
        kind: m.kind,
        category: m.category,
        subCategory: m.subCategory,
        startsAt: m.startsAt,
        venue: m.venue ?? null,
      }
      map.set(key, s)
    }
    s.rows.push(toSeriesRow(m))
    if (m.class === 'priceBucket') s.hasBuckets = true
    // A price series mixes a standalone binary with bucket members; the binary
    // carries the underlying/period the card is titled with.
    if (!s.underlying && m.underlying) s.underlying = m.underlying
    if (!s.period && m.period) s.period = m.period
    if (!s.expiry && m.expiry) s.expiry = m.expiry
    s.category ??= m.category
    s.subCategory ??= m.subCategory
    s.startsAt ??= m.startsAt
  }
  // Only price series form a ladder. Question members keep meta order (phase B
  // sorts them by probability).
  for (const s of map.values()) {
    if (s.kind === 'price') s.rows.sort((a, b) => ladderValue(a) - ladderValue(b))
  }
  return [...map.values()]
}

/**
 * Card / strip title:
 *  price            → "Where will BTC settle on 24 Aug, 2:00 PM?"
 *  question members → the question's resolved title
 *  everything else  → the market's own resolved name
 */
export function seriesTitle(s: Series): string {
  const first = s.rows[0]?.market
  if (s.kind === 'price' && s.underlying) {
    const d = parseExpiry(s.expiry)
    const when = d
      ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
          .replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')
      : ''
    return when ? `Where will ${s.underlying} settle on ${when}?` : `Where will ${s.underlying} settle?`
  }
  return first?.questionName || first?.name || ''
}
