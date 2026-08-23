import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { seriesTitle, type Series } from '@/lib/series'
import { categoryChip, formatDateTime, timeState, venueTooltip } from '@/lib/marketDisplay'
import { MarketAvatar } from '@/components/common/MarketAvatar'
import { MarketTimer } from './MarketTimer'

/**
 * The one time fact worth a card's meta line: when the event starts, that it is
 * under way, or how long until settlement. Rendered with its own `·` separator
 * so a dateless series (legacy testnet questions) leaves nothing behind.
 */
function SeriesTime({ startsAt, expiry }: { startsAt?: string; expiry?: string }) {
  // Only a scheduled start needs a local clock — it has to flip to "Live" on
  // its own. Plain deadlines are MarketTimer's job and it ticks itself.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startsAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startsAt])

  const state = timeState(startsAt, expiry, now)
  if (state.mode === 'none') return null

  return (
    <>
      <span>·</span>
      {state.mode === 'countdown' ? (
        <MarketTimer expiry={state.expiry} />
      ) : state.mode === 'live' ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-yes" />
          <span className="text-xs font-mono text-yes">Live</span>
        </span>
      ) : (
        <span className="text-xs font-mono text-gray-400">Starts {formatDateTime(state.at)}</span>
      )}
    </>
  )
}

/** Permissionless markets carry the deployer's venue tag; protocol ones don't. */
export function VenueTag({
  venue,
  feeScale,
  className = '',
}: {
  venue: string
  feeScale?: string | null
  className?: string
}) {
  return (
    <span
      title={venueTooltip(feeScale)}
      className={`font-semibold text-amber-400/70 border border-amber-500/20 px-1.5 rounded leading-4 ${className}`}
    >
      {venue}
    </span>
  )
}

/** Avatar + title + meta line — identical across all three card layouts. */
export function SeriesHeader({ series }: { series: Series }) {
  const first = series.rows[0]?.market
  const title = seriesTitle(series)
  // Price ladders label themselves with their period ("1d"); everything else
  // shows what the deployer tagged it as.
  // `capitalize` is for prose tags only — it would turn the period "1d" into "1D".
  const chip = series.period || categoryChip(series.category, series.subCategory)
  const chipClass = series.period ? '' : ' capitalize'

  return (
    <div className="flex items-start gap-3 mb-2">
      <MarketAvatar
        symbol={series.underlying}
        category={series.category}
        subCategory={series.subCategory}
        label={title}
        size={32}
      />
      <div className="flex-1 min-w-0">
        <Link
          to={`/market/${first?.outcomeId}`}
          className="block text-sm font-semibold text-gray-100 hover:text-amber-400 transition-colors leading-snug"
        >
          {title}
        </Link>
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-gray-500">
          {chip && (
            <span className={`font-semibold text-gray-400 bg-surface-3 px-1.5 rounded leading-4${chipClass}`}>
              {chip}
            </span>
          )}
          <span>
            {series.rows.length} market{series.rows.length === 1 ? '' : 's'}
          </span>
          <SeriesTime startsAt={series.startsAt} expiry={series.expiry} />
          {series.venue && <VenueTag venue={series.venue} feeScale={series.deployerFeeScale} />}
        </div>
      </div>
    </div>
  )
}
