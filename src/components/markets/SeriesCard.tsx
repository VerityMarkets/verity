import { Link, useNavigate } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { formatPriceCents } from '@/lib/marketFormat'
import { seriesTitle, rowGlyph, compactUsd, type Series, type SeriesRow } from '@/lib/series'
import { CoinLogo } from '@/components/common/CoinLogo'
import { MarketTimer } from './MarketTimer'

function RowIcon({ kind }: { kind: SeriesRow['kind'] }) {
  const g = rowGlyph(kind)
  if (!g) return null
  return <span className={kind === 'below' ? 'text-no' : 'text-yes'}>{g} </span>
}

function SeriesRowView({ row, tagBinary }: { row: SeriesRow; tagBinary: boolean }) {
  const navigate = useNavigate()
  const m = row.market
  const midRaw = useMarketStore((s) => s.mids[m.yesCoin])
  const yes = midRaw ? parseFloat(midRaw) : 0.5
  const pct = Math.round(yes * 100)

  const go = (side: 'yes' | 'no') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useMarketStore.getState().setTradeSide(side)
    navigate(`/market/${m.outcomeId}`)
  }

  return (
    <Link
      to={`/market/${m.outcomeId}`}
      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-white/5 transition-colors ${
        tagBinary && row.isBinary ? 'bg-amber-500/[0.06]' : ''
      }`}
    >
      <span className="text-sm text-gray-200 whitespace-nowrap overflow-hidden text-ellipsis min-w-0 tabular-nums">
        <RowIcon kind={row.kind} />
        {row.label}
        {tagBinary && row.isBinary && (
          <span className="ml-1 text-[9px] uppercase tracking-wide text-amber-400/80 font-semibold">bin</span>
        )}
      </span>
      <span className="text-sm font-bold text-gray-100 tabular-nums w-9 text-right">{pct}%</span>
      <button
        onClick={go('yes')}
        className="w-12 py-1 rounded-md text-xs font-semibold bg-yes/15 text-yes hover:bg-yes/25 transition-colors tabular-nums"
      >
        {formatPriceCents(yes)}¢
      </button>
      <button
        onClick={go('no')}
        className="w-12 py-1 rounded-md text-xs font-semibold bg-no/15 text-no hover:bg-no/25 transition-colors tabular-nums"
      >
        {formatPriceCents(1 - yes)}¢
      </button>
    </Link>
  )
}

/**
 * Stacked odds bar for the bucket question (Yes prices sum to ~100%).
 * Percentages sit inside their segment; the price thresholds are drawn once,
 * at the segment boundaries, so nothing is repeated.
 */
function BucketBar({ rows }: { rows: SeriesRow[] }) {
  const mids = useMarketStore((s) => s.mids)
  const buckets = rows.filter((r) => !r.isBinary && r.kind !== 'other')
  if (buckets.length < 2) return null
  const vals = buckets.map((r) => (mids[r.market.yesCoin] ? parseFloat(mids[r.market.yesCoin]) : 0))
  const total = vals.reduce((a, b) => a + b, 0) || 1
  const pcts = vals.map((v) => (v / total) * 100)
  const colors = ['bg-no/60', 'bg-amber-400/70', 'bg-yes/60', 'bg-blue-400/60', 'bg-purple-400/60']
  // boundary positions (cumulative %) and the threshold each marks
  const bounds: { left: number; label: string }[] = []
  let acc = 0
  for (let i = 0; i < buckets.length - 1; i++) {
    acc += pcts[i]
    const t = buckets[i].hi ?? buckets[i + 1].lo
    if (t != null) bounds.push({ left: acc, label: compactUsd(t) })
  }
  return (
    <div className="mt-3">
      <div className="h-4 rounded overflow-hidden flex text-[10px] font-semibold tabular-nums">
        {pcts.map((p, i) => (
          <div
            key={i}
            className={`${colors[i % colors.length]} flex items-center justify-center text-gray-950/80 overflow-hidden`}
            style={{ width: `${p}%` }}
          >
            {p >= 9 ? `${Math.round(p)}%` : ''}
          </div>
        ))}
      </div>
      <div className="relative h-5 text-[10px] text-gray-400 tabular-nums">
        {bounds.map((b, i) => (
          <div key={i} className="absolute top-0 w-0" style={{ left: `${b.left}%` }}>
            <div className="w-px h-1.5 bg-gray-500" />
            <div className="-translate-x-1/2 whitespace-nowrap leading-none mt-0.5">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SeriesCard({ series }: { series: Series }) {
  const single = series.rows.length === 1
  const first = series.rows[0]?.market

  return (
    <div className="card p-4 hover:border-amber-500/20 transition-all break-inside-avoid mb-4">
      <div className="flex items-start gap-3 mb-2">
        <CoinLogo symbol={series.underlying || first?.name?.slice(0, 1) || '?'} size={32} />
        <div className="flex-1 min-w-0">
          <Link
            to={`/market/${first?.outcomeId}`}
            className="block text-sm font-semibold text-gray-100 hover:text-amber-400 transition-colors leading-snug"
          >
            {seriesTitle(series)}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
            {series.period && (
              <span className="font-semibold text-gray-400 bg-surface-3 px-1.5 rounded leading-4">{series.period}</span>
            )}
            <span>{series.rows.length} market{single ? '' : 's'}</span>
            {series.expiry && (
              <>
                <span>·</span>
                <MarketTimer expiry={series.expiry} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-0.5">
        {series.rows.map((row) => (
          <SeriesRowView key={row.market.outcomeId} row={row} tagBinary={series.hasBuckets} />
        ))}
      </div>

      {series.hasBuckets && <BucketBar rows={series.rows} />}
    </div>
  )
}
