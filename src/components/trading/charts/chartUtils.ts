import { ColorType } from 'lightweight-charts'
import type { DeepPartial, ChartOptions } from 'lightweight-charts'
import type { ParsedMarket } from '@/lib/hyperliquid/types'
import { parseExpiry } from '@/lib/marketFormat'

// Re-export from shared location so existing imports keep working
export { parseExpiry, formatMarketName } from '@/lib/marketFormat'

export function parsePeriodMinutes(period: string): number {
  const match = period.match(/^(\d+)(m|H|D)$/i)
  if (!match) return 0
  const value = parseInt(match[1], 10)
  const unit = match[2]
  if (unit === 'm') return value
  if (unit === 'H' || unit === 'h') return value * 60
  if (unit === 'D' || unit === 'd') return value * 1440
  return 0
}

export function getBaseChartOptions(): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#6b7280',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' },
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.05)',
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.05)',
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      vertLine: { color: 'rgba(245,158,11,0.3)', labelBackgroundColor: '#92400e' },
      horzLine: { color: 'rgba(245,158,11,0.3)', labelBackgroundColor: '#92400e' },
    },
    handleScale: { mouseWheel: true, pinch: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
  }
}

/** Offset in seconds to shift UTC timestamps to local time for lightweight-charts */
export const LOCAL_TZ_OFFSET_SEC = new Date().getTimezoneOffset() * -60

/** Convert a UTC millisecond timestamp to a lightweight-charts local Time value */
export function toLocalChartTime(utcMs: number): number {
  return Math.floor(utcMs / 1000) + LOCAL_TZ_OFFSET_SEC
}

export function findLiveMarket(
  expiredMarket: ParsedMarket,
  allMarkets: ParsedMarket[]
): ParsedMarket | undefined {
  if (expiredMarket.class !== 'priceBinary') return undefined

  const now = Date.now()

  return allMarkets.find(
    (m) =>
      m.class === expiredMarket.class &&
      m.underlying === expiredMarket.underlying &&
      m.period === expiredMarket.period &&
      m.outcomeId !== expiredMarket.outcomeId &&
      (parseExpiry(m.expiry)?.getTime() ?? 0) > now
  )
}
