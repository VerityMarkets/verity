import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { useMainnetMid, fetchMainnetCandles } from '@/hooks/useMainnetMid'
import { getBaseChartOptions, parseExpiry, toLocalChartTime } from './chartUtils'

// Vertical line primitive for lightweight-charts v5
class VerticalLinePrimitive {
  _time: number
  _color: string
  _chart: IChartApi | null = null

  constructor(time: number, color: string) {
    this._time = time
    this._color = color
  }

  attached({ chart }: { chart: IChartApi }) {
    this._chart = chart
  }

  detached() {
    this._chart = null
  }

  updateAllViews() {}

  paneViews() {
    const self = this
    return [{
      renderer() {
        return {
          draw(target: { useMediaCoordinateSpace: (cb: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void) => void }) {
            if (!self._chart) return
            target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
              const x = self._chart!.timeScale().timeToCoordinate(self._time as Time)
              if (x === null) return
              ctx.save()
              ctx.strokeStyle = self._color
              ctx.lineWidth = 1
              ctx.setLineDash([4, 4])
              ctx.beginPath()
              ctx.moveTo(x, 0)
              ctx.lineTo(x, mediaSize.height)
              ctx.stroke()
              ctx.restore()
            })
          },
        }
      },
    }]
  }
}

interface UnderlyingCandleChartProps {
  underlying: string
  targetPrice: number
  periodMinutes: number
  /** Settlement price — shown as a price line when settled */
  settlementPrice?: number
  /** Settlement result — 'yes' or 'no', used for price line color */
  settlementResult?: 'yes' | 'no' | null
  /** Expiry string (YYYYMMDD-HHMM) — used to scope chart end time for settled markets */
  expiry?: string
}

export function UnderlyingCandleChart({ underlying, targetPrice, periodMinutes, settlementPrice, settlementResult, expiry }: UnderlyingCandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lastCandleTimeRef = useRef<number>(0)
  const lastCandleOHLC = useRef<{ open: number; high: number; low: number; close: number } | null>(null)
  const mid = useMainnetMid(underlying)

  // Create chart and fetch candles
  useEffect(() => {
    if (!containerRef.current) return

    const baseOpts = getBaseChartOptions()
    const chart = createChart(containerRef.current, {
      ...baseOpts,
      rightPriceScale: {
        ...baseOpts.rightPriceScale,
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: {
        ...baseOpts.timeScale,
        secondsVisible: false,
        ...(expiry ? { rightOffset: 5 } : {}),
      },
    })
    chartRef.current = chart

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = original()
        if (res !== null) {
          if (targetPrice > 0) {
            res.priceRange.minValue = Math.min(res.priceRange.minValue, targetPrice)
            res.priceRange.maxValue = Math.max(res.priceRange.maxValue, targetPrice)
          }
          if (settlementPrice !== undefined && settlementPrice > 0) {
            res.priceRange.minValue = Math.min(res.priceRange.minValue, settlementPrice)
            res.priceRange.maxValue = Math.max(res.priceRange.maxValue, settlementPrice)
          }
        }
        return res
      },
    })
    seriesRef.current = series

    // Target price line
    if (targetPrice > 0) {
      series.createPriceLine({
        price: targetPrice,
        color: '#52525b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Target',
      })
    }

    // Settlement price line (green if Yes won, red if No won)
    if (settlementPrice !== undefined && settlementPrice > 0) {
      const settledColor = settlementResult === 'yes' ? '#22c55e' : '#ef4444'
      series.createPriceLine({
        price: settlementPrice,
        color: settledColor,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: 'Settled',
      })
    }

    // For settled markets, scope chart to end shortly after expiry
    const isSettled = settlementPrice !== undefined
    const expiryDate = expiry ? parseExpiry(expiry) : null
    const endTime = isSettled && expiryDate
      ? expiryDate.getTime() + 2 * 60 * 60 * 1000 // 2h after expiry
      : Date.now()

    // Scale fetch window and candle interval to market period
    let interval = '1m'
    let windowMs = periodMinutes * 60 * 1000
    if (periodMinutes <= 0 || periodMinutes > 1440) {
      // Fallback: 24h of 15m candles
      windowMs = 24 * 60 * 60 * 1000
      interval = '15m'
    } else if (periodMinutes > 60) {
      // >1h: use 5m candles
      interval = '5m'
    }
    const startTime = endTime - windowMs

    fetchMainnetCandles(underlying, interval, startTime, endTime).then((candles) => {
      if (candles.length > 0) {
        const data = candles.map((c) => ({
          time: toLocalChartTime(c.t) as Time,
          open: parseFloat(c.o),
          high: parseFloat(c.h),
          low: parseFloat(c.l),
          close: parseFloat(c.c),
        }))
        series.setData(data)
        chart.timeScale().fitContent()
        const lastCandle = data[data.length - 1]
        lastCandleTimeRef.current = lastCandle.time as number
        lastCandleOHLC.current = {
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
        }

        // Vertical line at settlement time
        if (isSettled && expiryDate) {
          const expiryLocal = toLocalChartTime(expiryDate.getTime())
          const lineColor = settlementResult === 'yes' ? '#22c55e' : '#ef4444'
          series.attachPrimitive(new VerticalLinePrimitive(expiryLocal, lineColor))
        }
      }
    })

    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [underlying, targetPrice, periodMinutes, settlementPrice, settlementResult, expiry])

  // Real-time update: patch latest candle close/high/low (skip for settled markets)
  useEffect(() => {
    if (expiry) return // settled — no live updates
    if (!seriesRef.current || !mid || !lastCandleOHLC.current) return
    const price = parseFloat(mid)
    if (isNaN(price) || lastCandleTimeRef.current === 0) return

    const ohlc = lastCandleOHLC.current
    ohlc.close = price
    if (price > ohlc.high) ohlc.high = price
    if (price < ohlc.low) ohlc.low = price

    seriesRef.current.update({
      time: lastCandleTimeRef.current as Time,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
    })
  }, [mid])

  return <div ref={containerRef} className="h-64 w-full" />
}
