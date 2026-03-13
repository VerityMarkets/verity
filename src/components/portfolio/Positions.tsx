import { Link } from 'react-router-dom'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { parseToken } from '@/lib/hyperliquid/encoding'

export function Positions({ search = '' }: { search?: string }) {
  const balances = usePortfolioStore((s) => s.balances)
  const markets = useMarketStore((s) => s.markets)
  const mids = useMarketStore((s) => s.mids)

  const positions = balances
    .filter((b) => parseFloat(b.total) > 0)
    .map((b) => {
      const parsed = parseToken(b.coin)
      if (!parsed) return null

      const market = markets.find((m) => m.outcomeId === parsed.outcomeId)
      if (!market) return null

      const sideName = market.sideNames[parsed.side] ?? `Side ${parsed.side}`
      const coin = parsed.side === 0 ? market.yesCoin : market.noCoin
      const currentPrice = mids[coin] ? parseFloat(mids[coin]) : 0
      const entryPrice = parseFloat(b.entryNtl) / parseFloat(b.total)
      const pnl = (currentPrice - entryPrice) * parseFloat(b.total)

      return {
        ...b,
        market,
        sideName,
        side: parsed.side,
        currentPrice,
        entryPrice,
        pnl,
      }
    })
    .filter(Boolean)
    .filter((pos) => {
      if (!search || !pos) return true
      const q = search.toLowerCase()
      return (
        pos.market.name.toLowerCase().includes(q) ||
        pos.market.underlying.toLowerCase().includes(q)
      )
    })

  if (positions.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-400 text-sm">No positions yet</p>
        <p className="text-gray-500 text-xs mt-1">
          Buy outcome shares to see your positions here
        </p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase font-mono border-b border-white/5">
              <th className="text-left px-4 py-3">Market</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-right px-4 py-3">Shares</th>
              <th className="text-right px-4 py-3">Entry</th>
              <th className="text-right px-4 py-3">Current</th>
              <th className="text-right px-4 py-3">P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              if (!pos) return null
              return (
                <tr
                  key={pos.coin}
                  className="border-b border-white/3 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/market/${pos.market.outcomeId}`}
                      className="text-sm text-gray-200 hover:text-amber-400 transition-colors"
                    >
                      <span className="text-xs text-gray-500 font-mono mr-1.5">#{pos.market.outcomeId}</span>
                      {pos.market.underlying || pos.market.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        pos.side === 0
                          ? 'bg-yes/10 text-yes'
                          : 'bg-no/10 text-no'
                      }`}
                    >
                      {pos.sideName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {parseFloat(pos.total).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400 font-mono">
                    {Math.round(pos.entryPrice * 100)}¢
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {Math.round(pos.currentPrice * 100)}¢
                  </td>
                  <td
                    className={`px-4 py-3 text-right text-sm font-mono font-medium ${
                      pos.pnl >= 0 ? 'text-yes' : 'text-no'
                    }`}
                  >
                    {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
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
