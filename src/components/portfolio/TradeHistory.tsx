import { Link } from 'react-router-dom'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { parseCoin } from '@/lib/hyperliquid/encoding'
import { Tooltip } from '@/components/ui/Tooltip'

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function fullDate(ts: number): string {
  const d = new Date(ts)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }) + ` (${tz})`
}

export function TradeHistory({ search = '' }: { search?: string }) {
  const fills = usePortfolioStore((s) => s.fills)
  const markets = useMarketStore((s) => s.markets)

  const filteredFills = fills.filter((fill) => {
    if (!search) return true
    const parsed = parseCoin(fill.coin)
    const market = parsed
      ? markets.find((m) => m.outcomeId === parsed.outcomeId)
      : null
    if (!market) return true
    const q = search.toLowerCase()
    return (
      market.name.toLowerCase().includes(q) ||
      market.underlying.toLowerCase().includes(q)
    )
  })

  if (filteredFills.length === 0) {
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
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Size</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Fee</th>
            </tr>
          </thead>
          <tbody>
            {filteredFills.map((fill) => {
              const parsed = parseCoin(fill.coin)
              const market = parsed
                ? markets.find((m) => m.outcomeId === parsed.outcomeId)
                : null
              const sideName = market && parsed
                ? market.sideNames[parsed.side] ?? 'Unknown'
                : parsed ? (parsed.side === 0 ? 'Yes' : 'No') : fill.coin
              const isBuy = fill.side === 'B'

              return (
                <tr
                  key={fill.tid}
                  className="border-b border-white/3 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    <Tooltip text={fullDate(fill.time)}>
                      <span className="cursor-pointer border-b border-dashed border-gray-600 hover:border-gray-400 hover:text-gray-400 transition-colors">
                        {timeAgo(fill.time)}
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {parsed ? (
                      <Link
                        to={`/market/${parsed.outcomeId}`}
                        className="hover:text-amber-400 transition-colors"
                      >
                        <span className="text-xs text-gray-500 font-mono mr-1.5">#{parsed.outcomeId}</span>
                        {market ? (market.underlying || market.name) : `Outcome ${parsed.outcomeId}`}
                      </Link>
                    ) : (
                      fill.coin
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {isBuy ? 'Buy' : 'Sell'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        parsed && parsed.side === 0
                          ? 'bg-yes/10 text-yes'
                          : 'bg-no/10 text-no'
                      }`}
                    >
                      {sideName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {Math.round(parseFloat(fill.px) * 100)}¢
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {parseFloat(fill.sz).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    ${(parseFloat(fill.px) * parseFloat(fill.sz)).toFixed(2)}
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
