import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { parseCoin } from '@/lib/hyperliquid/encoding'

export function TradeHistory() {
  const fills = usePortfolioStore((s) => s.fills)
  const markets = useMarketStore((s) => s.markets)

  if (fills.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-400 text-sm">No trade history</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase font-mono border-b border-white/5">
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Market</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Size</th>
              <th className="text-right px-4 py-3">Fee</th>
            </tr>
          </thead>
          <tbody>
            {fills.map((fill) => {
              const parsed = parseCoin(fill.coin)
              const market = parsed
                ? markets.find((m) => m.outcomeId === parsed.outcomeId)
                : null
              const sideName = market && parsed
                ? market.sideNames[parsed.side] ?? 'Unknown'
                : fill.coin
              const isBuy = fill.side === 'B'
              const time = new Date(fill.time)
              const timeStr = `${time.getMonth() + 1}/${time.getDate()} ${time
                .getHours()
                .toString()
                .padStart(2, '0')}:${time
                .getMinutes()
                .toString()
                .padStart(2, '0')}`

              return (
                <tr
                  key={fill.tid}
                  className="border-b border-white/3 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {timeStr}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {market?.underlying || market?.name || fill.coin}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold ${
                        isBuy ? 'text-yes' : 'text-no'
                      }`}
                    >
                      {isBuy ? 'Buy' : 'Sell'} {sideName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {Math.round(parseFloat(fill.px) * 100)}¢
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {parseFloat(fill.sz).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">
                    {fill.fee}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
