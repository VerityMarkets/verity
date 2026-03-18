import { useState, useMemo } from 'react'
import { useMainnetMid } from '@/hooks/useMainnetMid'
import { useMarketStore } from '@/stores/marketStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { ProbabilityChart } from './charts/ProbabilityChart'
import { UnderlyingTickerChart } from './charts/UnderlyingTickerChart'
import { UnderlyingCandleChart } from './charts/UnderlyingCandleChart'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import { ChartHeader } from './charts/ChartHeader'
import { ChartCountdown } from './charts/ChartCountdown'
import { parseExpiry, parsePeriodMinutes } from './charts/chartUtils'
import { VerityWordmark } from '@/components/VerityWordmark'
import type { ChartType } from './charts/ChartTypeSelector'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

interface ChartContainerProps {
  market: ParsedMarket
  settled?: boolean
  settlementPrice?: number
  settlementResult?: 'yes' | 'no' | null
}

export function ChartContainer({ market, settled, settlementPrice, settlementResult }: ChartContainerProps) {
  const mid = useMainnetMid(market.underlying)
  const tradeSide = useMarketStore((s) => s.tradeSide)
  const mids = useMarketStore((s) => s.mids)
  const allFills = usePortfolioStore((s) => s.fills)

  // Filter fills to this market's coins
  const marketFills = useMemo(() => {
    if (!allFills || allFills.length === 0) return []
    return allFills.filter((f) => f.coin === market.yesCoin || f.coin === market.noCoin)
  }, [allFills, market.yesCoin, market.noCoin])

  const isBinary = market.class === 'priceBinary'
  const periodMinutes = parsePeriodMinutes(market.period)
  const isShortBinary = isBinary && periodMinutes > 0 && periodMinutes <= 15

  const showProbability = !settled

  // Default: ticker for short binary, candles for settled binary, probability otherwise
  const defaultChart: ChartType = settled
    ? (isShortBinary ? 'ticker' : isBinary ? 'candles' : 'ticker')
    : (isShortBinary ? 'ticker' : 'probability')
  const [chartType, setChartType] = useState<ChartType>(defaultChart)

  const isExpired = useMemo(() => {
    if (settled) return true
    const expDate = parseExpiry(market.expiry)
    if (!expDate) return false
    return expDate.getTime() <= Date.now()
  }, [market.expiry, settled])

  const currentPrice = mid ? parseFloat(mid) : 0

  // Reset chart type if it becomes unavailable
  const effectiveType = useMemo(() => {
    if (chartType === 'probability' && !showProbability) {
      return isShortBinary ? 'ticker' : isBinary ? 'candles' : 'ticker'
    }
    if (chartType === 'ticker' && !isShortBinary) return showProbability ? 'probability' : 'candles'
    if (chartType === 'candles' && !isBinary) return showProbability ? 'probability' : 'ticker'
    return chartType
  }, [chartType, isShortBinary, isBinary, showProbability])

  const showUnderlying = effectiveType === 'ticker' || effectiveType === 'candles'

  return (
    <div className="card p-4">
      {/* Header row */}
      {showUnderlying ? (
        <div className="flex items-start justify-between mb-3">
          <ChartHeader
            underlying={market.underlying}
            targetPrice={market.targetPrice}
            currentPrice={currentPrice}
            settlementPrice={settlementPrice}
          />
          <div className="mt-1 mr-1">
            <ChartCountdown
              expiry={market.expiry}
              market={market}
              isExpired={isExpired}
            />
          </div>
        </div>
      ) : (
        <ProbabilityHeader
          market={market}
          tradeSide={tradeSide}
          mids={mids}
          isExpired={isExpired}
        />
      )}

      {/* Chart area */}
      {effectiveType === 'probability' && !settled && (
        <ProbabilityChart coin={market.yesCoin} />
      )}
      {effectiveType === 'ticker' && (
        <UnderlyingTickerChart
          underlying={market.underlying}
          targetPrice={market.targetPrice}
          yesCoin={market.yesCoin}
          noCoin={market.noCoin}
          fills={marketFills}
        />
      )}
      {effectiveType === 'candles' && (
        <UnderlyingCandleChart
          underlying={market.underlying}
          targetPrice={market.targetPrice}
          periodMinutes={periodMinutes}
          settlementPrice={settlementPrice}
          settlementResult={settlementResult}
          expiry={settled ? market.expiry : undefined}
        />
      )}

      {/* Chart type selector */}
      <ChartTypeSelector
        activeType={effectiveType}
        onSelect={setChartType}
        showProbability={showProbability}
        showTicker={isShortBinary}
        showCandles={isBinary}
      />
    </div>
  )
}

// ─── Probability chart header ──────────────────────────────────────────────────

function ProbabilityHeader({
  market,
  tradeSide,
  mids,
  isExpired,
}: {
  market: ParsedMarket
  tradeSide: 'yes' | 'no'
  mids: Record<string, string>
  isExpired: boolean
}) {
  const coin = tradeSide === 'yes' ? market.yesCoin : market.noCoin
  const midVal = mids[coin] ? parseFloat(mids[coin]) : 0.5
  const pct = Math.round(midVal * 100)
  const isUp = tradeSide === 'yes'
  const direction = isUp ? 'UP' : 'DOWN'
  const dirColor = isUp ? 'text-yes' : 'text-no'

  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <div className={`text-[10px] font-semibold uppercase tracking-wide ${dirColor}`}>
          {direction}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-gray-100">{pct}% chance</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isExpired && (
          <ChartCountdown
            expiry={market.expiry}
            market={market}
            isExpired={isExpired}
          />
        )}
        {!isExpired && <VerityWordmark className="h-7 text-gray-600 mr-8" mono />}
      </div>
    </div>
  )
}
