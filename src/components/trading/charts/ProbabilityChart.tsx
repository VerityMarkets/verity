import { useEffect, useRef, useState } from 'react'
import { createChart, AreaSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { fetchCandles, fetchRecentTrades } from '@/lib/hyperliquid/api'
import { useMarketMid } from '@/hooks/useMarketMid'
import { formatPriceCents } from '@/lib/marketFormat'
import { getBaseChartOptions, toLocalChartTime } from './chartUtils'

export function ProbabilityChart({ coin }: { coin: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const lastTimeRef = useRef<number>(0)
  // Order-book mid when both sides are quoted; allMids otherwise.
  const mid = useMarketMid(coin)

  // Backfill mode: 'candles' (loaded from HL candleSnapshot) | 'trades' (loaded
  // from REST recentTrades) | 'pending' (waiting on candle fetch).
  // The REST path is used instead of the shared tradeStore, which holds a
  // single coin that RecentTrades re-targets when the user flips Yes/No.
  const [backfillMode, setBackfillMode] = useState<'pending' | 'candles' | 'trades'>('pending')

  // Create chart and try candleSnapshot backfill
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
        formatter: (price: number) => `${formatPriceCents(price)}%`,
      },
    })
    seriesRef.current = series

    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000

    setBackfillMode('pending')

    fetchCandles(coin, '1m', dayAgo, now)
      .then((candles) => {
        if (!candles || candles.length === 0) {
          console.warn(
            `[ProbabilityChart] No candleSnapshot data for ${coin} (1m, 24h) — falling back to trades stream`,
          )
          setBackfillMode('trades')
          return
        }
        const data = candles.map((c) => ({
          time: toLocalChartTime(c.t) as Time,
          value: parseFloat(c.c),
        }))
        series.setData(data)
        chart.timeScale().fitContent()
        lastTimeRef.current = data[data.length - 1].time as number
        setBackfillMode('candles')
        if (import.meta.env.DEV) {
          console.log(`[ProbabilityChart] Loaded ${data.length} candles for ${coin} (1m, 24h)`)
        }
      })
      .catch((err) => {
        console.error(
          `[ProbabilityChart] candleSnapshot failed for ${coin}:`,
          err,
        )
        setBackfillMode('trades')
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
  }, [coin])

  // Trade fallback: when candleSnapshot was empty/errored, hydrate from the
  // REST recentTrades snapshot (ascending time order), bucketed to 1-minute
  // resolution to match the candle grid + the live-update bucket.
  useEffect(() => {
    if (backfillMode !== 'trades') return
    let cancelled = false
    fetchRecentTrades(coin)
      .then((trades) => {
        if (cancelled || !seriesRef.current || !chartRef.current) return
        const sorted = trades.filter((t) => t.coin === coin).sort((a, b) => a.time - b.time)
        const buckets = new Map<number, number>() // minuteSec → latest price
        for (const t of sorted) {
          const minute = Math.floor(toLocalChartTime(t.time) / 60) * 60
          buckets.set(minute, parseFloat(t.px))
        }
        const data: { time: Time; value: number }[] = Array.from(buckets.entries())
          .sort(([a], [b]) => a - b)
          .map(([time, value]) => ({ time: time as Time, value }))
        if (data.length === 0) return
        seriesRef.current.setData(data)
        chartRef.current.timeScale().fitContent()
        lastTimeRef.current = data[data.length - 1].time as number
        if (import.meta.env.DEV) {
          console.log(`[ProbabilityChart] Backfilled ${data.length} points from recentTrades for ${coin}`)
        }
      })
      .catch(() => { /* live mids will fill in */ })
      .finally(() => { if (!cancelled) setBackfillMode('candles') })
    return () => { cancelled = true }
  }, [backfillMode, coin])

  // Real-time updates from allMids — bucketed to 1-minute boundaries so live
  // ticks align with the candle backfill grid. Within a minute we overwrite
  // the same point (latest mid wins); when a new minute starts we append.
  // Without this, sub-second mid updates pile dozens of points into the same
  // wall-clock minute and the x-axis auto-labels collapse to repeated "HH:MM".
  useEffect(() => {
    if (!seriesRef.current || !mid) return
    const value = mid
    if (isNaN(value)) return

    const nowSec = toLocalChartTime(Date.now())
    const minuteBucket = Math.floor(nowSec / 60) * 60
    if (minuteBucket < lastTimeRef.current) return // never go backwards
    lastTimeRef.current = minuteBucket

    seriesRef.current.update({
      time: minuteBucket as Time,
      value,
    })
  }, [mid])

  return <div ref={containerRef} className="h-64 w-full" />
}
