import { useState, useMemo } from 'react'
import { useMarketStore } from '@/stores/marketStore'
import { ProbabilityChart } from './charts/ProbabilityChart'
import { UnderlyingTickerChart } from './charts/UnderlyingTickerChart'
import { UnderlyingCandleChart } from './charts/UnderlyingCandleChart'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import { ChartHeader } from './charts/ChartHeader'
import { ChartCountdown } from './charts/ChartCountdown'
import { parseExpiry, parsePeriodMinutes } from './charts/chartUtils'
import type { ChartType } from './charts/ChartTypeSelector'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

interface ChartContainerProps {
  market: ParsedMarket
  settled?: boolean
}

export function ChartContainer({ market, settled }: ChartContainerProps) {
  const [chartType, setChartType] = useState<ChartType>('probability')
  const mid = useMarketStore((s) => s.mids[market.underlying])

  const isBinary = market.class === 'priceBinary'
  const periodMinutes = parsePeriodMinutes(market.period)
  const isShortBinary = isBinary && periodMinutes > 0 && periodMinutes <= 15

  const isExpired = useMemo(() => {
    if (settled) return true
    const expDate = parseExpiry(market.expiry)
    if (!expDate) return false
    return expDate.getTime() <= Date.now()
  }, [market.expiry, settled])

  const currentPrice = mid ? parseFloat(mid) : 0

  // Reset chart type if it becomes unavailable
  const effectiveType = useMemo(() => {
    if (chartType === 'ticker' && !isShortBinary) return 'probability'
    if (chartType === 'candles' && !isBinary) return 'probability'
    return chartType
  }, [chartType, isShortBinary, isBinary])

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
          />
          <ChartCountdown
            expiry={market.expiry}
            market={market}
            isExpired={isExpired}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Probability</h3>
          {isExpired && (
            <ChartCountdown
              expiry={market.expiry}
              market={market}
              isExpired={isExpired}
            />
          )}
        </div>
      )}

      {/* Chart area */}
      {effectiveType === 'probability' && (
        <ProbabilityChart coin={market.yesCoin} />
      )}
      {effectiveType === 'ticker' && (
        <UnderlyingTickerChart
          underlying={market.underlying}
          targetPrice={market.targetPrice}
        />
      )}
      {effectiveType === 'candles' && (
        <UnderlyingCandleChart
          underlying={market.underlying}
          targetPrice={market.targetPrice}
        />
      )}

      {/* Chart type selector */}
      <ChartTypeSelector
        activeType={effectiveType}
        onSelect={setChartType}
        showTicker={isShortBinary}
        showCandles={isBinary}
      />
    </div>
  )
}
