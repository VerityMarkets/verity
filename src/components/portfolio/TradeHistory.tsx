import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { parseCoin } from '@/lib/hyperliquid/encoding'
import { formatMarketName } from '@/components/trading/charts/chartUtils'
import { Tooltip } from '@/components/ui/Tooltip'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

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
  const settledOutcomes = useMarketStore((s) => s.settledOutcomes)
  const getSettledMarket = useMarketStore((s) => s.getSettledMarket)
  const fetchSettledMarket = useMarketStore((s) => s.fetchSettledMarket)
  const quoteCoin = useMarketStore((s) => s.outcomeQuoteCoin) || 'USDC'

  // Collect outcome IDs from fills that aren't in active markets → fetch settled data
  const missingOutcomeIds = useMemo(() => {
    const ids = new Set<number>()
    for (const fill of fills) {
      if (fill.coin.startsWith('@')) continue
      const parsed = parseCoin(fill.coin)
      if (!parsed) continue
      const inActive = markets.some((m) => m.outcomeId === parsed.outcomeId)
      if (!inActive) ids.add(parsed.outcomeId)
    }
    return ids
  }, [fills, markets])

  useEffect(() => {
    for (const id of missingOutcomeIds) {
      fetchSettledMarket(id)
    }
  }, [missingOutcomeIds, fetchSettledMarket])

  // Helper: resolve market from active or settled cache
  function resolveMarket(outcomeId: number): ParsedMarket | undefined {
    return markets.find((m) => m.outcomeId === outcomeId) ?? getSettledMarket(outcomeId)?.market
  }

  const filteredFills = fills.filter((fill) => {
    if (!search) return true
    const q = search.toLowerCase()
    const isSwap = fill.coin.startsWith('@')
    const isSettlement = fill.dir === 'Settlement'

    // Allow searching by type
    if (isSwap && ('swap'.includes(q) || 'usdh'.includes(q) || 'usdc'.includes(q))) return true
    if (isSettlement && 'settlement'.includes(q)) return true

    const parsed = parseCoin(fill.coin)
    const market = parsed ? resolveMarket(parsed.outcomeId) : undefined
    if (!market) return !search // show non-market fills when no search
    const displayName = formatMarketName(market)
    return (
      displayName.toLowerCase().includes(q) ||
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
              <th className="text-right px-4 py-3">Total / PNL</th>
              <th className="text-right px-4 py-3">Fee</th>
            </tr>
          </thead>
          <tbody>
            {filteredFills.map((fill) => {
              const isSwap = fill.coin.startsWith('@')
              const isSettlement = fill.dir === 'Settlement'
              const parsed = !isSwap ? parseCoin(fill.coin) : null
              const market = parsed ? resolveMarket(parsed.outcomeId) : undefined
              const sideName = market && parsed
                ? market.sideNames[parsed.side] ?? 'Unknown'
                : parsed ? (parsed.side === 0 ? 'Yes' : 'No') : ''
              const isBuy = fill.side === 'B'
              const pnl = parseFloat(fill.closedPnl)

              return (
                <tr
                  key={fill.tid}
                  className="border-b border-white/3 hover:bg-surface-2/50 transition-colors"
                >
                  {/* Time */}
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    <Tooltip text={fullDate(fill.time)}>
                      <span className="cursor-pointer border-b border-dashed border-gray-600 hover:border-gray-400 hover:text-gray-400 transition-colors">
                        {timeAgo(fill.time)}
                      </span>
                    </Tooltip>
                  </td>

                  {/* Market */}
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {isSwap ? (
                      <span className="text-gray-400">
                        {quoteCoin} / USDC
                      </span>
                    ) : parsed ? (
                      <Link
                        to={`/market/${parsed.outcomeId}`}
                        className="hover:text-amber-400 transition-colors"
                      >
                        <span className="text-xs text-gray-500 font-mono mr-1.5">#{parsed.outcomeId}</span>
                        {market ? formatMarketName(market) : `Outcome ${parsed.outcomeId}`}
                      </Link>
                    ) : (
                      fill.coin
                    )}
                  </td>

                  {/* Action */}
                  <td className={`px-4 py-3 text-sm ${
                    isSwap ? 'text-gray-200' : isSettlement ? 'text-amber-400' : isBuy ? 'text-yes' : 'text-no'
                  }`}>
                    {isSwap ? 'Swap' : isSettlement ? 'Settlement' : isBuy ? 'Buy' : 'Sell'}
                  </td>

                  {/* Side */}
                  <td className="px-4 py-3">
                    {isSwap ? (
                      <span className="text-xs font-semibold text-gray-200">To {isBuy ? 'USDH' : 'USDC'}</span>
                    ) : (
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          parsed && parsed.side === 0
                            ? 'bg-yes/10 text-yes'
                            : 'bg-no/10 text-no'
                        }`}
                      >
                        {sideName}
                      </span>
                    )}
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {isSwap
                      ? `$${parseFloat(fill.px).toFixed(4)}`
                      : `${Math.round(parseFloat(fill.px) * 100)}¢`}
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {parseFloat(fill.sz).toFixed(isSwap ? 2 : 0)}
                  </td>

                  {/* Total / PNL */}
                  <td className="px-4 py-3 text-right text-sm font-mono">
                    {isSettlement ? (
                      <span className={pnl >= 0 ? 'text-yes' : 'text-no'}>
                        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-gray-200">
                        ${(parseFloat(fill.px) * parseFloat(fill.sz)).toFixed(2)}
                      </span>
                    )}
                  </td>

                  {/* Fee */}
                  <td className="px-4 py-3 text-right text-xs text-gray-500 font-mono">
                    {parseFloat(fill.fee) > 0 ? fill.fee : '—'}
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
