import { useEffect, useMemo, useRef, useState } from 'react'
import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { SeriesCard } from './SeriesCard'
import { groupBySeries, type Series } from '@/lib/series'
import { parseExpiry } from '@/lib/marketFormat'
import { getMarketCategory, getCategoryDef } from '@/categories'
import type { AllMids, ParsedMarket } from '@/lib/hyperliquid/types'
import type { Category } from './CategoryBar'

const UNDERLYING_ORDER = ['BTC', 'ETH', 'SOL', 'HYPE']

/** Series rendered per page. Each one opens an l2Book stream per row, and HL
 *  caps a client at 1000 subscriptions — with 400+ listed markets on testnet,
 *  rendering everything at once would blow past that and kill the socket. */
const PAGE_SIZE = 24

/**
 * HL returns exactly "0.5" from allMids for a coin nobody has ever quoted, so
 * `mid !== '0.5'` is a cheap "this market has real trade interest" signal that
 * needs no book subscription. Returned as a joined string so the selector's
 * Object.is check stops an allMids tick from re-rendering the whole list.
 */
function quotedSignature(markets: ParsedMarket[], mids: AllMids): string {
  let sig = ''
  for (const m of markets) {
    const mid = mids[m.yesCoin]
    if (mid && mid !== '0.5') sig += m.outcomeId + ','
  }
  return sig
}

/** Sort position of a series' underlying: BTC, ETH, SOL, HYPE, then the rest. */
function underlyingRank(u: string): number {
  const i = UNDERLYING_ORDER.indexOf(u.toUpperCase())
  return i === -1 ? UNDERLYING_ORDER.length : i
}

/** Soonest-first key; series with no date sort last. */
function whenKey(s: Series): string {
  return s.startsAt || s.expiry || '99999999-9999'
}

function lowestOutcomeId(s: Series): number {
  let min = Number.POSITIVE_INFINITY
  for (const r of s.rows) min = Math.min(min, r.market.outcomeId)
  return min
}

export function MarketList({ category = 'trending' }: { category?: Category }) {
  const markets = useMarketStore((s) => s.markets)
  const loading = useMarketStore((s) => s.loading)
  const error = useMarketStore((s) => s.error)
  const getYesPrice = useMarketStore((s) => s.getYesPrice)
  const quotedSig = useMarketStore((s) => quotedSignature(s.markets, s.mids))

  // Page count is scoped to the category it was grown in, so switching tabs
  // snaps back to one page without an extra render pass.
  const [paging, setPaging] = useState<{ cat: Category; page: number }>({ cat: category, page: 1 })
  const page = paging.cat === category ? paging.page : 1

  const filtered = useMemo(() => {
    let list = [...markets]
    const catDef = getCategoryDef(category)

    if (!catDef || catDef.type === 'meta') {
      // Meta categories — custom sort/filter logic
      switch (category) {
        case 'trending':
          list.sort((a, b) => {
            const devA = Math.abs(getYesPrice(a) - 0.5)
            const devB = Math.abs(getYesPrice(b) - 0.5)
            return devB - devA
          })
          break

        case 'new': {
          const now = Date.now()
          const dayMs = 24 * 60 * 60 * 1000
          list = list.filter((m) => {
            const exp = parseExpiry(m.expiry)
            return exp && exp.getTime() > now && exp.getTime() - now < dayMs
          })
          break
        }
      }
    } else {
      // Content categories — filter using the categorization system
      list = list.filter((m) => getMarketCategory(m) === category)
    }

    return list
  }, [markets, category, getYesPrice])

  // Group related markets into one card. Ordering is deterministic (never
  // driven by a live price) so cards don't shuffle as mids arrive: markets
  // somebody has quoted first, then protocol before permissionless, then
  // richer series, soonest event, a fixed underlying order, and finally id.
  const series = useMemo(() => {
    const quoted = new Set(quotedSig.split(',').filter(Boolean).map(Number))
    const isQuoted = (s: Series) => (s.rows.some((r) => quoted.has(r.market.outcomeId)) ? 0 : 1)
    return groupBySeries(filtered).sort(
      (a, b) =>
        isQuoted(a) - isQuoted(b) ||
        (a.venue == null ? 0 : 1) - (b.venue == null ? 0 : 1) ||
        b.rows.length - a.rows.length ||
        whenKey(a).localeCompare(whenKey(b)) ||
        underlyingRank(a.underlying) - underlyingRank(b.underlying) ||
        lowestOutcomeId(a) - lowestOutcomeId(b),
    )
  }, [filtered, quotedSig])

  const visible = useMemo(() => series.slice(0, page * PAGE_SIZE), [series, page])

  // Keep the Yes-side book of every *rendered* market live so cards can show
  // real mids and flag markets nobody has quoted yet (allMids reports a 0.5
  // placeholder for empty books). Only the current page is subscribed, and the
  // diff below never tears down a coin that is still on screen.
  const yesCoins = useMemo(
    () => visible.flatMap((s) => s.rows.map((r) => r.market.yesCoin)),
    [visible],
  )
  const subscribed = useRef<Set<string>>(new Set())
  useEffect(() => {
    const { subscribeBook, unsubscribeBook } = useOrderBookStore.getState()
    const next = new Set(yesCoins)
    for (const coin of next) if (!subscribed.current.has(coin)) subscribeBook(coin)
    for (const coin of subscribed.current) if (!next.has(coin)) unsubscribeBook(coin)
    subscribed.current = next
  }, [yesCoins.join(',')])

  useEffect(
    () => () => {
      const { unsubscribeBook } = useOrderBookStore.getState()
      for (const coin of subscribed.current) unsubscribeBook(coin)
      subscribed.current = new Set()
    },
    [],
  )

  if (loading && markets.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-surface-3 rounded w-1/3 mb-3" />
            <div className="h-5 bg-surface-3 rounded w-2/3 mb-4" />
            <div className="h-1.5 bg-surface-3 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="text-red-400 text-sm mb-2">Failed to load markets</p>
        <p className="text-gray-500 text-xs">{error}</p>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-400 text-sm">No markets in this category</p>
        <p className="text-gray-500 text-xs mt-1">
          Try a different filter or check back soon
        </p>
      </div>
    )
  }

  const remaining = series.length - visible.length

  // CSS multi-column gives a masonry-like flow: cards of different heights
  // pack without leaving a tall card's neighbours floating over empty space.
  return (
    <>
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
        {visible.map((s) => (
          <SeriesCard key={s.key} series={s} />
        ))}
      </div>

      {remaining > 0 && (
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setPaging({ cat: category, page: page + 1 })}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-2 text-gray-300 border border-white/5 hover:text-gray-100 hover:border-white/15 transition-colors"
          >
            Show more
            <span className="text-gray-500 ml-1.5">{remaining} more</span>
          </button>
        </div>
      )}
    </>
  )
}
