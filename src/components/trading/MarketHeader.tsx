import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { MarketTimer } from '../markets/MarketTimer'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

interface MarketHeaderProps {
  market: ParsedMarket
  settled?: boolean
  settlementResult?: 'yes' | 'no' | null
}

export function MarketHeader({ market, settled, settlementResult }: MarketHeaderProps) {
  const mids = useMarketStore((s) => s.mids)
  const books = useOrderBookStore((s) => s.books)

  // Use mid from order book (midpoint of best bid/ask), fallback to allMids
  const yesMid = mids[market.yesCoin] ? parseFloat(mids[market.yesCoin]) : 0.5
  const noMid = mids[market.noCoin] ? parseFloat(mids[market.noCoin]) : 0.5

  // For settled markets, show final prices
  const yesPrice = settled ? (settlementResult === 'yes' ? 1 : 0) : yesMid
  const noPrice = settled ? (settlementResult === 'no' ? 1 : 0) : noMid

  const yesPct = Math.round(yesPrice * 100)
  const noPct = Math.round(noPrice * 100)

  const isRecurring = market.class === 'priceBinary'

  return (
    <div className="card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500 font-mono">
              #{market.outcomeId}
            </span>
            {settled && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yes/15 text-yes">
                Resolved
              </span>
            )}
            {isRecurring && !settled && (
              <span className="text-[10px] font-semibold text-gray-400 bg-surface-3 px-1.5 rounded leading-4">
                {market.period}
              </span>
            )}
          </div>

          <h1 className="text-lg font-bold text-gray-100">
            {isRecurring ? (
              <>
                Will {market.underlying} be above $
                {market.targetPrice.toLocaleString()}?
              </>
            ) : (
              market.name
            )}
          </h1>

          {!isRecurring && market.description && (
            <p className="text-xs text-gray-400 mt-1">{market.description}</p>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-yes">{yesPct}¢</div>
            <div className="text-[10px] text-gray-500 uppercase">
              {market.sideNames[0]}
            </div>
          </div>
          <div className="w-px h-10 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-bold text-no">
              {noPct}¢
            </div>
            <div className="text-[10px] text-gray-500 uppercase">
              {market.sideNames[1]}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar + timer */}
      <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
        <div className="flex-1 mr-4">
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yes to-yes/60 transition-all duration-500"
              style={{ width: `${yesPct}%` }}
            />
          </div>
        </div>
        {settled ? (
          <span className="text-xs text-gray-500 font-mono">Settled</span>
        ) : (
          market.expiry && <MarketTimer expiry={market.expiry} />
        )}
      </div>
    </div>
  )
}
