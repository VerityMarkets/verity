import { MarketList } from '@/components/markets/MarketList'

export function HomePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Markets</h1>
        <p className="text-sm text-gray-400 mt-1">
          Trade binary outcomes on Hyperliquid
        </p>
      </div>
      <MarketList />
    </div>
  )
}
