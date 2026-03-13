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

  // Color-code progress bar by probability
  const barColor = yesPct >= 70
    ? 'from-yes to-yes/60'           // green — high probability
    : yesPct >= 50
      ? 'from-amber-400 to-amber-400/60' // amber — moderate
      : yesPct >= 30
        ? 'from-orange-500 to-orange-500/60' // orange — low-moderate
        : 'from-no to-no/60'               // red — low probability

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

          {isRecurring && market.underlying && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] text-gray-500">Oracle:</span>
              <a
                href={`https://app.hyperliquid.xyz/trade/${market.underlying}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
              >
                HL Mainnet {market.underlying} Spot
                <svg className="w-2.5 h-2.5 inline ml-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}

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
              className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-500`}
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
