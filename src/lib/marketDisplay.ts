/**
 * Presentation helpers shared by the market card, the series strip, the market
 * header and search. Everything here is pure — the React pieces stay small and
 * this is the one place that decides how a date, a side button or a row order
 * reads.
 */
import { parseExpiry } from '@/lib/marketFormat'
import type { SeriesRow } from '@/lib/series'
import type { AllMids } from '@/lib/hyperliquid/types'
import type { BookData } from '@/stores/orderbookStore'

/** "20260812-0346" → "Aug 12, 3:46 PM" in the viewer's timezone. '' if unparseable. */
export function formatDateTime(ts: string | undefined): string {
  if (!ts) return ''
  const d = parseExpiry(ts)
  if (!d) return ''
  return d
    .toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\bam\b/i, 'AM')
    .replace(/\bpm\b/i, 'PM')
}

/**
 * Which time fact a card/header should show:
 *  - `starts`    the event has a scheduled start still in the future
 *  - `live`      the start has passed but settlement has not
 *  - `countdown` no scheduled start (price ladders, plain deadlines)
 *  - `none`      the market carries no dates at all (legacy testnet questions)
 */
export type TimeState =
  | { mode: 'starts'; at: string }
  | { mode: 'live' }
  | { mode: 'countdown'; expiry: string }
  | { mode: 'none' }

export function timeState(
  startsAt: string | undefined,
  expiry: string | undefined,
  now: number = Date.now(),
): TimeState {
  const start = startsAt ? parseExpiry(startsAt) : null
  const end = expiry ? parseExpiry(expiry) : null
  if (start) {
    if (start.getTime() > now) return { mode: 'starts', at: startsAt! }
    // Started; still live until settlement (a missing deadline reads as live
    // rather than as a countdown to nothing).
    if (!end || end.getTime() > now) return { mode: 'live' }
  }
  if (end) return { mode: 'countdown', expiry: expiry! }
  return { mode: 'none' }
}

/** True when the two sides are the plain Yes/No pair (bare cent buttons). */
export function isYesNoPair(sides: readonly [string, string]): boolean {
  return sides[0].toLowerCase() === 'yes' && sides[1].toLowerCase() === 'no'
}

/**
 * Label for a side button: `52¢` for a Yes/No pair (the button's colour already
 * says which side it is), `MIN 52¢` when the template named the sides.
 */
export function sideButtonLabel(sideName: string, cents: string, named: boolean): string {
  return named ? `${sideName} ${cents}¢` : `${cents}¢`
}

/** `sports · football`, `economics`, or '' — the meta-line category chip. */
export function categoryChip(category?: string, subCategory?: string): string {
  if (!category) return subCategory ?? ''
  if (!subCategory || subCategory === category) return category
  return `${category} · ${subCategory}`
}

/** Tooltip for the permissionless-venue tag, naming the deployer fee scale. */
export function venueTooltip(feeScale?: string | null): string {
  const base = 'Permissionless market (deployer venue)'
  return feeScale ? `${base} · deployer fee scale ${feeScale}` : base
}

// --- Row ordering -----------------------------------------------------------

/**
 * True when the row shows a price rather than "no quotes yet" — i.e. the book
 * has resting orders, or has not arrived yet and the row is still falling back
 * to allMids. Ranking on the same condition the row renders keeps the list from
 * ever *looking* unsorted while books stream in.
 */
export function hasPrice(coin: string, books: Record<string, BookData | undefined>): boolean {
  const b = books[coin]
  return !b || b.bids.length > 0 || b.asks.length > 0
}

/**
 * Probability used to rank a row — the same number the row prints, so the list
 * never looks unsorted: order-book mid when the book is two-sided, else HL's
 * allMids (see `useMarketMid`).
 */
export function rowProbability(
  coin: string,
  books: Record<string, BookData | undefined>,
  mids: AllMids,
): number {
  const b = books[coin]
  const bid = b?.bids[0]?.px
  const ask = b?.asks[0]?.px
  if (bid && ask) return (parseFloat(bid) + parseFloat(ask)) / 2
  const mid = mids[coin]
  return mid ? parseFloat(mid) : 0.5
}

/**
 * Question members, most likely first. Rows nobody has quoted sort last in
 * their original (deployment) order so the tail never shuffles — `sort` is
 * stable, and every unquoted row compares equal.
 */
export function sortRowsByProbability(
  rows: SeriesRow[],
  books: Record<string, BookData | undefined>,
  mids: AllMids,
): SeriesRow[] {
  return [...rows].sort((a, b) => {
    const pa = hasPrice(a.market.yesCoin, books)
    const pb = hasPrice(b.market.yesCoin, books)
    if (pa !== pb) return pa ? -1 : 1
    if (!pa) return 0
    return rowProbability(b.market.yesCoin, books, mids) - rowProbability(a.market.yesCoin, books, mids)
  })
}

/** The sorted order as a comparable string, so a re-sort that changes nothing
 *  never re-renders the card. Feed the result to `orderRows`. */
export function rowOrderKey(
  rows: SeriesRow[],
  books: Record<string, BookData | undefined>,
  mids: AllMids,
): string {
  return sortRowsByProbability(rows, books, mids)
    .map((r) => r.market.outcomeId)
    .join(',')
}

/** Re-apply an order produced by `rowOrderKey`; rows it does not mention keep
 *  their input position at the end. */
export function orderRows(rows: SeriesRow[], key: string): SeriesRow[] {
  if (!key) return rows
  const byId = new Map(rows.map((r) => [r.market.outcomeId, r]))
  const out: SeriesRow[] = []
  for (const part of key.split(',')) {
    const id = Number(part)
    const row = byId.get(id)
    if (row) {
      out.push(row)
      byId.delete(id)
    }
  }
  for (const r of rows) if (byId.has(r.market.outcomeId)) out.push(r)
  return out
}
