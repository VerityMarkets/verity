import { useState, useEffect } from 'react'

function parseExpiry(expiry: string): Date | null {
  // Format: 20260313-0300
  const match = expiry.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Settled'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function MarketTimer({ expiry }: { expiry: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('')

  useEffect(() => {
    const expiryDate = parseExpiry(expiry)
    if (!expiryDate) {
      setTimeLeft('')
      return
    }

    const update = () => {
      const ms = expiryDate.getTime() - Date.now()
      setTimeLeft(formatTimeLeft(ms))
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [expiry])

  if (!timeLeft) return null

  const isSettled = timeLeft === 'Settled'

  return (
    <div className="flex items-center gap-1.5">
      <svg className={`w-3 h-3 ${isSettled ? 'text-gray-500' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={`text-xs font-mono ${isSettled ? 'text-gray-500' : 'text-gray-400'}`}>
        {timeLeft}
      </span>
    </div>
  )
}
