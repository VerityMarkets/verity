import { useMemo } from 'react'
import { useMarketStore } from '@/stores/marketStore'
import { MarketCard } from './MarketCard'
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map((market) => (
        <MarketCard key={market.outcomeId} market={market} />
      ))}
    </div>
  )
}
