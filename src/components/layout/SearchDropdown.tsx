import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'

/** Build a readable market title. Recurring markets have name "Recurring". */
function marketTitle(m: { name: string; class: string; underlying: string; targetPrice: number }): string {
  if (m.class === 'priceBinary' && m.underlying && m.targetPrice) {
    return `Will ${m.underlying} be above $${m.targetPrice.toLocaleString()}?`
  }
  return m.name
}

/** Format expiry string "YYYYMMDD-HHMM" → "Mar 13, 03:00" */
function formatExpiry(expiry: string): string {
  const match = expiry.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/)
  if (!match) return expiry
  const [, y, mo, d, h, mi] = match
  const date = new Date(+y, +mo - 1, +d, +h, +mi)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' + h + ':' + mi
}

interface SearchDropdownProps {
  className?: string
  placeholder?: string
}

export function SearchDropdown({ className = '', placeholder = 'Search markets...' }: SearchDropdownProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const markets = useMarketStore((s) => s.markets)
  const getYesPrice = useMarketStore((s) => s.getYesPrice)

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const q = query.toLowerCase().trim()
  const results = q.length >= 1
    ? markets
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.underlying.toLowerCase().includes(q) ||
            m.class.toLowerCase().includes(q) ||
            String(m.outcomeId).includes(q)
        )
        .slice(0, 8)
    : []

  function select(outcomeId: number) {
    navigate(`/market/${outcomeId}`)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        placeholder={placeholder}
        className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30"
      />

      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-1 border border-white/10 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto">
          {results.map((m) => {
            const yesPct = Math.round(getYesPrice(m) * 100)
            return (
              <button
                key={m.outcomeId}
                onClick={() => select(m.outcomeId)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-2/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="text-sm text-gray-200 truncate">
                    {marketTitle(m)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                    <span>{m.underlying}</span>
                    {m.period && <span className="text-gray-600">·</span>}
                    {m.period && <span>{m.period}</span>}
                    {m.expiry && <span className="text-gray-600">·</span>}
                    {m.expiry && <span>{formatExpiry(m.expiry)}</span>}
                  </div>
                </div>
                <div className="text-sm font-semibold text-yes shrink-0">
                  {yesPct}¢
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
