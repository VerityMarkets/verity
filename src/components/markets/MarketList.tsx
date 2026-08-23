import { useEffect, useMemo } from 'react'
import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { SeriesCard } from './SeriesCard'
import { groupBySeries } from '@/lib/series'
import { getMarketCategory, getCategoryDef } from '@/categories'
import type { Category } from './CategoryBar'

/** Parse the expiry string (YYYYMMDD-HHMM) into a Date. */
function parseExpiry(expiry: string): Date | null {
  if (!expiry || expiry.length < 13) return null
  const y = parseInt(expiry.slice(0, 4), 10)
  const mo = parseInt(expiry.slice(4, 6), 10) - 1
  const d = parseInt(expiry.slice(6, 8), 10)
  const h = parseInt(expiry.slice(9, 11), 10)
  const mi = parseInt(expiry.slice(11, 13), 10)
  return new Date(Date.UTC(y, mo, d, h, mi))
}

const UNDERLYING_ORDER = ['BTC', 'ETH', 'SOL', 'HYPE']

export function MarketList({ category = 'trending' }: { category?: Category }) {
  const markets = useMarketStore((s) => s.markets)
  const loading = useMarketStore((s) => s.loading)
  const error = useMarketStore((s) => s.error)
  const getYesPrice = useMarketStore((s) => s.getYesPrice)

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

  // Group related markets (same underlying · period · expiry) into one card.
  // Ordering is deterministic (not price-driven) so cards don't shuffle as
  // mids arrive: richer series first, then a fixed underlying order, then
  // soonest expiry.
  const series = useMemo(() => {
    const rank = (u: string) => {
      const i = UNDERLYING_ORDER.indexOf(u.toUpperCase())
      return i === -1 ? UNDERLYING_ORDER.length : i
    }
    return groupBySeries(filtered).sort(
      (a, b) =>
        b.rows.length - a.rows.length ||
        rank(a.underlying) - rank(b.underlying) ||
        a.expiry.localeCompare(b.expiry),
    )
  }, [filtered])

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

  // Keep the Yes-side book of every listed market live so cards can show
  // real mids and flag markets nobody has quoted yet (allMids reports a 0.5
  // placeholder for empty books). One l2Book stream per market — cheap at
  // today's listing count.
  const yesCoins = useMemo(() => series.flatMap((s) => s.rows.map((r) => r.market.yesCoin)), [series])
  useEffect(() => {
    const { subscribeBook, unsubscribeBook } = useOrderBookStore.getState()
    yesCoins.forEach(subscribeBook)
    return () => yesCoins.forEach(unsubscribeBook)
  }, [yesCoins.join(',')])

  // CSS multi-column gives a masonry-like flow: cards of different heights
  // pack without leaving a tall card's neighbours floating over empty space.
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
      {series.map((s) => (
        <SeriesCard key={s.key} series={s} />
      ))}
    </div>
  )
}
