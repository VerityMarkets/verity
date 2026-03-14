import { Link } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { formatMarketName } from '@/lib/marketFormat'
import type { ParsedMarket } from '@/lib/hyperliquid/types'
import { MarketTimer } from './MarketTimer'

export function MarketCard({ market }: { market: ParsedMarket }) {
  const getYesPrice = useMarketStore((s) => s.getYesPrice)
  const yesPrice = getYesPrice(market)
  const yesPct = Math.round(yesPrice * 100)

  const isRecurring = market.class === 'priceBinary'

  return (
    <Link to={`/market/${market.outcomeId}`} className="card p-4 hover:border-amber-500/20 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500 font-mono">
              #{market.outcomeId}
            </span>
            {isRecurring && (
              <span className="text-[10px] font-semibold text-gray-400 bg-surface-3 px-1.5 rounded leading-4">
                {market.period}
              </span>
            )}
          </div>

          <h3 className="text-sm font-semibold text-gray-100 group-hover:text-amber-400 transition-colors leading-snug">
            {formatMarketName(market)}{isRecurring ? '?' : ''}
          </h3>
        </div>

        {/* Price circle */}
        <div className="relative w-14 h-14 shrink-0">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
            <circle
              className="text-surface-3"
              strokeWidth="3"
              stroke="currentColor"
              fill="none"
              r="15.9155"
              cx="18"
              cy="18"
            />
            <circle
              className="text-yes"
              strokeWidth="3"
              stroke="currentColor"
              fill="none"
              r="15.9155"
              cx="18"
              cy="18"
              strokeDasharray={`${yesPct} ${100 - yesPct}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-100">{yesPct}%</span>
          </div>
        </div>
      </div>

      {/* Yes/No bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-yes font-medium">
            {market.sideNames[0]} {yesPct}¢
          </span>
          <span className="text-no font-medium">
            {market.sideNames[1]} {100 - yesPct}¢
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yes to-yes/70 transition-all duration-500"
            style={{ width: `${yesPct}%` }}
          />
        </div>
      </div>

      {/* Timer */}
      {market.expiry && (
        <div className="mt-3 pt-2 border-t border-white/5">
          <MarketTimer expiry={market.expiry} />
        </div>
      )}
    </Link>
  )
}
