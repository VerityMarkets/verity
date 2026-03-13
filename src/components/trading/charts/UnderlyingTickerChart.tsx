import { useEffect, useRef } from 'react'
import { createChart, LineSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { useMarketStore } from '@/stores/marketStore'
import { getBaseChartOptions } from './chartUtils'

interface UnderlyingTickerChartProps {
  underlying: string
  targetPrice: number
}

const WINDOW_SECONDS = 60
const THROTTLE_MS = 500

export function UnderlyingTickerChart({ underlying, targetPrice }: UnderlyingTickerChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const dataRef = useRef<Array<{ time: number; value: number }>>([])
  const lastUpdateRef = useRef<number>(0)
  const mid = useMarketStore((s) => s.mids[underlying])

  // Create chart
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
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 0,
        fixRightEdge: true,
      },
      handleScale: false,
      handleScroll: false,
    })
    chartRef.current = chart

    const series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
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

    // Reset data buffer
    dataRef.current = []
    lastUpdateRef.current = 0

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

  // Real-time sliding window updates
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || !mid) return
    const price = parseFloat(mid)
    if (isNaN(price)) return

    // Throttle updates
    const now = Date.now()
    if (now - lastUpdateRef.current < THROTTLE_MS) return
    lastUpdateRef.current = now

    const timeSec = Math.floor(now / 1000)

    // Avoid duplicate timestamps
    const lastPoint = dataRef.current[dataRef.current.length - 1]
    if (lastPoint && lastPoint.time >= timeSec) return

    dataRef.current.push({ time: timeSec, value: price })

    // Trim old data (keep 2x window for buffer)
    const cutoff = timeSec - WINDOW_SECONDS * 2
    dataRef.current = dataRef.current.filter((d) => d.time > cutoff)

    // Update chart
    seriesRef.current.update({
      time: timeSec as Time,
      value: price,
    })

    // Keep visible range to last WINDOW_SECONDS
    const from = (timeSec - WINDOW_SECONDS) as Time
    const to = timeSec as Time
    chartRef.current.timeScale().setVisibleRange({ from, to })
  }, [mid])

  return <div ref={containerRef} className="h-64 w-full" />
}
