import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { useChatStore } from '@/stores/chatStore'
import { MarketHeader } from '@/components/trading/MarketHeader'
import { TradeForm } from '@/components/trading/TradeForm'
import { OrderBook } from '@/components/trading/OrderBook'
import { ChartContainer } from '@/components/trading/ChartContainer'
import { RecentTrades } from '@/components/trading/RecentTrades'
import { Trollbox } from '@/components/chat/Trollbox'
import { toToken } from '@/lib/hyperliquid/encoding'
import { getChatGroup } from '@/lib/chatGroup'
import { parseExpiry } from '@/components/trading/charts/chartUtils'

type BookTab = 'book' | 'trades'

export function MarketPage() {
  const { id } = useParams<{ id: string }>()
  const getMarket = useMarketStore((s) => s.getMarket)
  const getSettledMarket = useMarketStore((s) => s.getSettledMarket)
  const fetchSettledMarket = useMarketStore((s) => s.fetchSettledMarket)
  const loading = useMarketStore((s) => s.loading)
  const selectMarket = useMarketStore((s) => s.selectMarket)
  const tradeSide = useMarketStore((s) => s.tradeSide)
  const setFilter = useChatStore((s) => s.setFilter)

  const [loadingSettledMarket, setLoadingSettledMarket] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [bookTab, setBookTab] = useState<BookTab>('book')

  const marketId = id ? parseInt(id, 10) : null

  // Read market: active first, then settled cache
  const activeMarket = marketId !== null ? getMarket(marketId) : undefined
  const settledInfo = marketId !== null ? getSettledMarket(marketId) : undefined
  const market = activeMarket ?? settledInfo?.market
  const settled = !activeMarket && !!settledInfo
  const settlementResult = settled
    ? (parseFloat(settledInfo!.settleFraction) === 1 ? 'yes' : 'no')
    : null

  const isExpired = useMemo(() => {
    if (settled) return true
    if (!market) return false
    const expDate = parseExpiry(market.expiry)
    if (!expDate) return false
    return expDate.getTime() <= Date.now()
  }, [market, settled])

  const activeCoin = market
    ? (tradeSide === 'yes' ? market.yesCoin : market.noCoin)
    : null

  const sideName = market
    ? (tradeSide === 'yes' ? market.sideNames[0] : market.sideNames[1])
    : ''
  const isYes = tradeSide === 'yes'

  const subscribeBook = useOrderBookStore((s) => s.subscribeBook)
  const unsubscribeAll = useOrderBookStore((s) => s.unsubscribeAll)

  const chatGroup = market ? getChatGroup(market) : null

  // Select market on navigation
  useEffect(() => {
    if (marketId !== null) {
      selectMarket(marketId)
    }
    return () => {
      selectMarket(null)
    }
  }, [marketId])

  // Fetch settled outcome when market isn't active (initial load or mid-session settlement)
  useEffect(() => {
    if (marketId !== null && !activeMarket && !settledInfo) {
      setLoadingSettledMarket(true)
      fetchSettledMarket(marketId).finally(() => setLoadingSettledMarket(false))
    }
  }, [marketId, !activeMarket, !settledInfo])

  // Set chat filter to group key (e.g. "bo:BTC:1d") once market resolves
  useEffect(() => {
    if (chatGroup) {
      setFilter(chatGroup.key)
    } else if (marketId !== null) {
      setFilter(String(marketId))
    }
    return () => {
      setFilter('global')
    }
  }, [marketId, chatGroup?.key])

  useEffect(() => {
    if (!activeMarket) return
    subscribeBook(activeMarket.yesCoin)
    subscribeBook(activeMarket.noCoin)
    return () => unsubscribeAll()
  }, [activeMarket?.yesCoin, activeMarket?.noCoin])

  const trollboxMarket = chatGroup
    ? { id: chatGroup.key, label: chatGroup.label }
    : undefined

  const trollboxMarketCtx = market
    ? {
        yesToken: toToken(market.outcomeId, 0),
        noToken: toToken(market.outcomeId, 1),
        sideNames: market.sideNames,
      }
    : undefined

  if (loading || loadingSettledMarket) {
    return (
      <div className="card p-8 text-center">
        <div className="animate-pulse text-gray-400 text-sm">Loading market...</div>
      </div>
    )
  }

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

  // Settled market view
  if (settled) {
    const winnerSide = settlementResult === 'yes' ? 0 : 1
    const winnerName = market.sideNames[winnerSide]
    const winnerColor = winnerSide === 0 ? 'text-yes' : 'text-no'
    const winnerBg = winnerSide === 0 ? 'bg-yes/10' : 'bg-no/10'

    // Parse settlement price from details (e.g. "price:70082")
    const detailsParsed = settledInfo!.details.split(':')
    const settlementPrice = detailsParsed.length === 2 ? parseFloat(detailsParsed[1]) : undefined

    return (
      <div>
        <MarketHeader market={market} settled settlementResult={settlementResult} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {/* Left: Chart */}
          <div className="lg:col-span-2">
            <ChartContainer market={market} settled settlementPrice={settlementPrice} settlementResult={settlementResult} />
          </div>

          {/* Right: Result card */}
          <div>
            <div className="card p-6 text-center">
              <div className={`w-16 h-16 rounded-full ${winnerBg} flex items-center justify-center mx-auto mb-4`}>
                <svg className={`w-8 h-8 ${winnerColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className={`text-lg font-bold ${winnerColor} mb-1`}>
                Outcome: {winnerName}
              </div>
              {settlementPrice !== undefined && (
                <div className={`text-sm font-mono ${winnerColor} mb-1`}>
                  ${settlementPrice.toLocaleString()}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-3">
                This market has been resolved.
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Your shares have been settled and paid out automatically.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Active market view
  return (
    <div>
      <MarketHeader market={market} />

      {/* Main grid: Chart + Trade Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Left column */}
        <div className={`${isExpired ? 'lg:col-span-3' : 'lg:col-span-2'} space-y-4`}>
          <ChartContainer market={market} />

          {/* Accordion: Book / Trades (hidden for expired markets) */}
          {!isExpired && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setBookOpen(!bookOpen)}
                className="flex items-center justify-between w-full px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-300">
                    {bookTab === 'book' ? 'Order Book' : 'Recent Trades'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isYes ? 'bg-yes/15 text-yes' : 'bg-no/15 text-no'
                    }`}
                  >
                    {sideName}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${bookOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {bookOpen && (
                <div className="border-t border-white/5">
                  <div className="flex border-b border-white/5">
                    <button
                      onClick={() => setBookTab('book')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        bookTab === 'book'
                          ? 'text-white border-b-2 border-amber-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      Book
                    </button>
                    <button
                      onClick={() => setBookTab('trades')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        bookTab === 'trades'
                          ? 'text-white border-b-2 border-amber-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      Trades
                    </button>
                  </div>
                  <div className="p-4">
                    {bookTab === 'book' ? (
                      <OrderBook coin={activeCoin!} />
                    ) : (
                      <RecentTrades coin={activeCoin!} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: Trade Form + Trollbox (hidden for expired markets) */}
        {!isExpired && (
          <div className="space-y-4">
            <TradeForm market={market} />
            {bookOpen && (
              <Trollbox
                market={trollboxMarket}
                marketCtx={trollboxMarketCtx}
                className="hidden lg:flex"
                style={{ height: '400px' }}
              />
            )}
          </div>
        )}
      </div>

      {/* Trollbox full-width below when book is closed */}
      {(!bookOpen || isExpired) && (
        <Trollbox
          market={trollboxMarket}
          marketCtx={trollboxMarketCtx}
          className="hidden lg:flex mt-4"
          style={{ height: '400px' }}
        />
      )}
    </div>
  )
}
