import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { useMarketMid, useQuoteState } from '@/hooks/useMarketMid'
import { groupBySeries, seriesKey, type SeriesRow } from '@/lib/series'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

const compact = (n: number) =>
  n >= 1000 ? `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : n.toLocaleString()

function chipLabel(r: SeriesRow): string {
  if (r.kind === 'below') return compact(r.hi ?? 0)
  if (r.kind === 'above') return compact(r.lo ?? 0)
  if (r.kind === 'between') return `${compact(r.lo ?? 0)} ↔ ${compact(r.hi ?? 0)}`
  return r.label
}

function Chip({ row, active, tagBinary }: { row: SeriesRow; active: boolean; tagBinary: boolean }) {
  const mid = useMarketMid(row.market.yesCoin)
  const quote = useQuoteState(row.market.yesCoin)
  const pct = quote.loaded && !quote.quoted ? '—' : `${Math.round(mid * 100)}%`
  return (
    <Link
      to={`/market/${row.market.outcomeId}`}
      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        active
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          : 'bg-surface-2 text-gray-300 border-white/5 hover:text-gray-100 hover:border-white/15'
      }`}
    >
      {row.kind !== 'between' && (
        <span className={row.kind === 'below' ? 'text-no' : 'text-yes'}>
          {row.kind === 'below' ? '↓' : '↑'}
        </span>
      )}
      {chipLabel(row)}
      <span className={active ? 'text-amber-300' : 'text-gray-500'}>{pct}</span>
      {tagBinary && row.isBinary && <span className="text-[9px] uppercase tracking-wide opacity-70">binary</span>}
    </Link>
  )
}

/** Sibling markets in the same series (underlying · period · expiry). */
export function SeriesStrip({ market }: { market: ParsedMarket }) {
  const markets = useMarketStore((s) => s.markets)
  const key = seriesKey(market)
  const series = groupBySeries(markets.filter((m) => seriesKey(m) === key))[0]

  // Keep sibling Yes books live so chips show real mids / "—" for empty books.
  // The active market's books are owned by MarketPage; skip those here so
  // our cleanup doesn't tear them down.
  const siblings = (series?.rows ?? [])
    .map((r) => r.market.yesCoin)
    .filter((c) => c !== market.yesCoin && c !== market.noCoin)
  useEffect(() => {
    const { subscribeBook, unsubscribeBook } = useOrderBookStore.getState()
    siblings.forEach(subscribeBook)
    return () => siblings.forEach(unsubscribeBook)
  }, [siblings.join(',')])

  if (!series || series.rows.length < 2) return null

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 [scrollbar-width:none]">
      {[...series.rows.filter((r) => !r.isBinary), ...series.rows.filter((r) => r.isBinary)].map((r) => (
        <Chip key={r.market.outcomeId} row={r} active={r.market.outcomeId === market.outcomeId} tagBinary={series.hasBuckets} />
      ))}
    </div>
  )
}
