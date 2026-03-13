import { ColorType } from 'lightweight-charts'
import type { DeepPartial, ChartOptions } from 'lightweight-charts'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

export function parseExpiry(expiry: string): Date | null {
  const match = expiry.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
}

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
