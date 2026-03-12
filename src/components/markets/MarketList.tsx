import { useMarketStore } from '@/stores/marketStore'
import { MarketCard } from './MarketCard'

export function MarketList() {
  const markets = useMarketStore((s) => s.markets)
  const loading = useMarketStore((s) => s.loading)
  const error = useMarketStore((s) => s.error)

  if (loading) {
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

  if (markets.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-400 text-sm">No markets available yet</p>
        <p className="text-gray-500 text-xs mt-1">
          Markets will appear when HIP-4 launches
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {markets.map((market) => (
        <MarketCard key={market.outcomeId} market={market} />
      ))}
    </div>
  )
}
