import { useOrderBookStore } from '@/stores/orderbookStore'
import { usePortfolioStore } from '@/stores/portfolioStore'

export function OrderBook({ coin }: { coin: string }) {
  const books = useOrderBookStore((s) => s.books)
  const openOrders = usePortfolioStore((s) => s.openOrders)

  const book = books[coin]
  const bids = book?.bids ?? []
  const asks = book?.asks ?? []

  // Build a set of price levels where user has resting orders for this coin
  const userOrderPrices = new Set<string>()
  for (const order of openOrders) {
    if (order.coin === coin) {
      userOrderPrices.add(parseFloat(order.limitPx).toFixed(8))
    }
  }

  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.sz)), 1)
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.sz)), 1)

  const displayAsks = asks.slice(0, 8).reverse()
  const displayBids = bids.slice(0, 8)

  return (
    <div className="space-y-0.5">
        {/* Header */}
        <div className="grid grid-cols-3 text-[10px] text-gray-500 uppercase font-mono pb-1">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) */}
        {displayAsks.map((level, i) => {
          const pct = Math.ceil(parseFloat(level.px) * 100)
          const sizeRatio = parseFloat(level.sz) / maxAskSize
          const hasOrder = userOrderPrices.has(parseFloat(level.px).toFixed(8))
          return (
            <div key={`a-${i}`} className="relative grid grid-cols-3 text-xs font-mono py-0.5">
              <div
                className="absolute inset-0 bg-no/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-no relative flex items-center">
                {hasOrder && (
                  <span className="text-amber-400 text-[10px] absolute -left-3">★</span>
                )}
                {pct}¢
              </span>
              <span className="text-right text-gray-300 relative">
                {parseFloat(level.sz).toFixed(0)}
              </span>
              <span className="text-right text-gray-500 relative">
                {(parseFloat(level.px) * parseFloat(level.sz)).toFixed(1)}
              </span>
            </div>
          )
        })}

        {/* Spread */}
        <div className="py-1 text-center">
          <span className="text-[10px] text-gray-500 font-mono">
            {displayBids.length > 0 && displayAsks.length > 0
              ? `Spread: ${(
                  (parseFloat(displayAsks[displayAsks.length - 1]?.px ?? '0') -
                    parseFloat(displayBids[0]?.px ?? '0')) *
                  100
                ).toFixed(1)}¢`
              : 'No orders'}
          </span>
        </div>

        {/* Bids (buys) */}
        {displayBids.map((level, i) => {
          const pct = Math.floor(parseFloat(level.px) * 100)
          const sizeRatio = parseFloat(level.sz) / maxBidSize
          const hasOrder = userOrderPrices.has(parseFloat(level.px).toFixed(8))
          return (
            <div key={`b-${i}`} className="relative grid grid-cols-3 text-xs font-mono py-0.5">
              <div
                className="absolute inset-0 bg-yes/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-yes relative flex items-center">
                {hasOrder && (
                  <span className="text-amber-400 text-[10px] absolute -left-3">★</span>
                )}
                {pct}¢
              </span>
              <span className="text-right text-gray-300 relative">
                {parseFloat(level.sz).toFixed(0)}
              </span>
              <span className="text-right text-gray-500 relative">
                {(parseFloat(level.px) * parseFloat(level.sz)).toFixed(1)}
              </span>
            </div>
          )
        })}
    </div>
  )
}
