import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { parseExpiry, findLiveMarket } from './chartUtils'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

interface ChartCountdownProps {
  expiry: string
  market: ParsedMarket
  isExpired: boolean
}

export function ChartCountdown({ expiry, market, isExpired }: ChartCountdownProps) {
  if (isExpired) {
    return <GoToLiveMarketButton market={market} />
  }

  return <CountdownTimer expiry={expiry} />
}

function CountdownTimer({ expiry }: { expiry: string }) {
  const [parts, setParts] = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    const expiryDate = parseExpiry(expiry)
    if (!expiryDate) return

    const update = () => {
      const ms = Math.max(0, expiryDate.getTime() - Date.now())
      const totalSecs = Math.floor(ms / 1000)
      const hours = Math.floor(totalSecs / 3600)
      const mins = Math.floor((totalSecs % 3600) / 60)
      const secs = totalSecs % 60

      if (hours > 0) {
        setParts([
          { value: String(hours).padStart(2, '0'), label: 'HRS' },
          { value: String(mins).padStart(2, '0'), label: 'MINS' },
        ])
      } else {
        setParts([
          { value: String(mins).padStart(2, '0'), label: 'MINS' },
          { value: String(secs).padStart(2, '0'), label: 'SECS' },
        ])
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiry])

  return (
    <div className="flex items-baseline gap-1.5">
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-baseline">
          {i > 0 && <span className="text-xl font-bold font-mono text-red-400 mr-1">:</span>}
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold font-mono text-red-400 tabular-nums">{p.value}</span>
            <span className="text-[8px] text-gray-500 uppercase tracking-wider -mt-0.5">{p.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function GoToLiveMarketButton({ market }: { market: ParsedMarket }) {
  const markets = useMarketStore((s) => s.markets)
  const liveMarket = findLiveMarket(market, markets)

  if (!liveMarket) {
    return (
      <span className="text-xs text-gray-500">
        Expired
      </span>
    )
  }

  return (
    <Link
      to={`/market/${liveMarket.outcomeId}`}
      className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 bg-surface-3 px-3 py-1.5 rounded hover:text-white transition-colors"
    >
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      Go to live market
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
