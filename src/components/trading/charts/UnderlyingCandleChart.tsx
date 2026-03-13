import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { fetchCandles } from '@/lib/hyperliquid/api'
import { useMarketStore } from '@/stores/marketStore'
import { getBaseChartOptions } from './chartUtils'

interface UnderlyingCandleChartProps {
  underlying: string
  targetPrice: number
}

export function UnderlyingCandleChart({ underlying, targetPrice }: UnderlyingCandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lastCandleTimeRef = useRef<number>(0)
  const lastCandleOHLC = useRef<{ open: number; high: number; low: number; close: number } | null>(null)
  const mid = useMarketStore((s) => s.mids[underlying])

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
    })
    seriesRef.current = series

    // Target price line
    if (targetPrice > 0) {
      series.createPriceLine({
        price: targetPrice,
        color: '#92400e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Target',
      })
    }

    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000

    fetchCandles(underlying, '1m', dayAgo, now).then((candles) => {
      if (candles.length > 0) {
        const data = candles.map((c) => ({
          time: Math.floor(c.t / 1000) as Time,
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
  }, [underlying, targetPrice])

  // Real-time update: patch latest candle close/high/low
  useEffect(() => {
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
