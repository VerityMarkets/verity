import { useEffect } from 'react'
import { useTradeStore } from '@/stores/tradeStore'

export function RecentTrades({ coin }: { coin: string }) {
  const trades = useTradeStore((s) => s.trades)
  const subscribeTrades = useTradeStore((s) => s.subscribeTrades)
  const unsubscribeTrades = useTradeStore((s) => s.unsubscribeTrades)

  useEffect(() => {
    subscribeTrades(coin)
    return () => unsubscribeTrades()
  }, [coin])

  return (
    <div className="space-y-0.5">
        <div className="grid grid-cols-3 text-[10px] text-gray-500 uppercase font-mono pb-1">
          <span>Price</span>
          <span className="text-right">Size</span>
          <span className="text-right">Time</span>
        </div>

        {trades.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No trades yet</p>
        ) : (
          trades.slice(0, 20).map((trade) => {
            const pct = Math.round(parseFloat(trade.px) * 100)
            const isBuy = trade.side === 'B'
            const time = new Date(trade.time)
            const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time
              .getMinutes()
              .toString()
              .padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`

            return (
              <div key={trade.tid} className="grid grid-cols-3 text-xs font-mono py-0.5">
                <span className={isBuy ? 'text-yes' : 'text-no'}>
                  {pct}¢
                </span>
                <span className="text-right text-gray-300">
                  {parseFloat(trade.sz).toFixed(0)}
                </span>
                <span className="text-right text-gray-500">{timeStr}</span>
              </div>
            )
          })
        )}
    </div>
  )
}
