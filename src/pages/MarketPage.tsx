import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { useChatStore } from '@/stores/chatStore'
import { MarketHeader } from '@/components/trading/MarketHeader'
import { TradeForm } from '@/components/trading/TradeForm'
import { OrderBook } from '@/components/trading/OrderBook'
import { PriceChart } from '@/components/trading/PriceChart'
import { RecentTrades } from '@/components/trading/RecentTrades'

export function MarketPage() {
  const { id } = useParams<{ id: string }>()
  const getMarket = useMarketStore((s) => s.getMarket)
  const selectMarket = useMarketStore((s) => s.selectMarket)
  const setFilter = useChatStore((s) => s.setFilter)

  const marketId = id ? parseInt(id, 10) : null
  const market = marketId !== null ? getMarket(marketId) : undefined

  useEffect(() => {
    if (marketId !== null) {
      selectMarket(marketId)
      setFilter(String(marketId))
    }
    return () => {
      selectMarket(null)
      setFilter('global')
    }
  }, [marketId])

  if (!market) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-400 text-sm mb-2">Market not found</p>
        <Link to="/" className="text-amber-400 text-sm hover:underline">
          Back to markets
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Markets
      </Link>

      <MarketHeader market={market} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Left column: chart + trades */}
        <div className="lg:col-span-2 space-y-4">
          <PriceChart coin={market.yesCoin} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OrderBook coin={market.yesCoin} />
            <RecentTrades coin={market.yesCoin} />
          </div>
        </div>

        {/* Right column: trade form */}
        <div>
          <TradeForm market={market} />
        </div>
      </div>
    </div>
  )
}
