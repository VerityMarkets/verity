import { useEffect } from 'react'
import { useOrderBookStore } from '@/stores/orderbookStore'

export function OrderBook({ coin }: { coin: string }) {
  const bids = useOrderBookStore((s) => s.bids)
  const asks = useOrderBookStore((s) => s.asks)
  const fetchBook = useOrderBookStore((s) => s.fetchBook)
  const subscribeBook = useOrderBookStore((s) => s.subscribeBook)
  const unsubscribeBook = useOrderBookStore((s) => s.unsubscribeBook)

  useEffect(() => {
    fetchBook(coin)
    subscribeBook(coin)
    return () => unsubscribeBook()
  }, [coin])

  const maxBidSize = Math.max(...bids.map((b) => parseFloat(b.sz)), 1)
  const maxAskSize = Math.max(...asks.map((a) => parseFloat(a.sz)), 1)

  const displayAsks = [...asks].reverse().slice(0, 8)
  const displayBids = bids.slice(0, 8)

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Order Book</h3>

      <div className="space-y-0.5">
        {/* Header */}
        <div className="grid grid-cols-3 text-[10px] text-gray-500 uppercase font-mono pb-1">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) */}
        {displayAsks.map((level, i) => {
          const pct = Math.round(parseFloat(level.px) * 100)
          const sizeRatio = parseFloat(level.sz) / maxAskSize
          return (
            <div key={`a-${i}`} className="relative grid grid-cols-3 text-xs font-mono py-0.5">
              <div
                className="absolute inset-0 bg-no/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-no relative">{pct}¢</span>
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
          const pct = Math.round(parseFloat(level.px) * 100)
          const sizeRatio = parseFloat(level.sz) / maxBidSize
          return (
            <div key={`b-${i}`} className="relative grid grid-cols-3 text-xs font-mono py-0.5">
              <div
                className="absolute inset-0 bg-yes/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-yes relative">{pct}¢</span>
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
    </div>
  )
}
