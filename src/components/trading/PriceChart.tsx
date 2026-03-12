import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, ColorType } from 'lightweight-charts'
import { fetchCandles } from '@/lib/hyperliquid/api'

export function PriceChart({ coin }: { coin: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
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
        vertLine: { color: 'rgba(245,158,11,0.3)', labelBackgroundColor: '#f59e0b' },
        horzLine: { color: 'rgba(245,158,11,0.3)', labelBackgroundColor: '#f59e0b' },
      },
      handleScale: { mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    })

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b',
      topColor: 'rgba(245,158,11,0.15)',
      bottomColor: 'rgba(245,158,11,0.01)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `${Math.round(price * 100)}¢`,
      },
    })

    // Fetch candle data
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000

    fetchCandles(coin, '5m', dayAgo, now).then((candles) => {
      if (candles.length > 0) {
        const data = candles.map((c) => ({
          time: Math.floor(c.t / 1000) as import('lightweight-charts').Time,
          value: parseFloat(c.c),
        }))
        series.setData(data)
        chart.timeScale().fitContent()
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [coin])

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Price Chart</h3>
      <div ref={containerRef} className="h-64 w-full" />
    </div>
  )
}
