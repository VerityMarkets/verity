import { useEffect, useRef } from 'react'
import { createChart, AreaSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { fetchCandles } from '@/lib/hyperliquid/api'
import { useMarketStore } from '@/stores/marketStore'
import { getBaseChartOptions, toLocalChartTime } from './chartUtils'

export function ProbabilityChart({ coin }: { coin: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const lastTimeRef = useRef<number>(0)
  const mid = useMarketStore((s) => s.mids[coin])

  // Create chart and fetch initial data
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      ...getBaseChartOptions(),
    })
    chartRef.current = chart

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b',
      topColor: 'rgba(245,158,11,0.15)',
      bottomColor: 'rgba(245,158,11,0.01)',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${Math.round(price * 100)}%`,
      },
    })
    seriesRef.current = series

    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000

    fetchCandles(coin, '5m', dayAgo, now).then((candles) => {
      if (candles.length > 0) {
        const data = candles.map((c) => ({
          time: toLocalChartTime(c.t) as Time,
          value: parseFloat(c.c),
        }))
        series.setData(data)
        chart.timeScale().fitContent()
        lastTimeRef.current = data[data.length - 1].time as number
      }
    }).catch(() => { /* coin may be delisted/settled */ })

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
  }, [coin])

  // Real-time updates from allMids
  useEffect(() => {
    if (!seriesRef.current || !mid) return
    const value = parseFloat(mid)
    if (isNaN(value)) return

    const now = toLocalChartTime(Date.now())
    if (now <= lastTimeRef.current) return
    lastTimeRef.current = now

    seriesRef.current.update({
      time: now as Time,
      value,
    })
  }, [mid])

  return <div ref={containerRef} className="h-64 w-full" />
}
