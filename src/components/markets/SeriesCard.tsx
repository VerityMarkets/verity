import { Link, useNavigate } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { useMarketMid, useQuoteState } from '@/hooks/useMarketMid'
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
  const yes = useMarketMid(m.yesCoin)
  const { loaded, quoted } = useQuoteState(m.yesCoin)
  const unquoted = loaded && !quoted
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
      <span className="text-sm text-gray-200 whitespace-nowrap min-w-0 tabular-nums">
        <RowIcon kind={row.kind} />
        {row.label}
        {tagBinary && row.isBinary && (
          <span className="ml-1 text-[9px] uppercase tracking-wide text-amber-400/80 font-semibold">bin</span>
        )}
      </span>
      {unquoted ? (
        <>
          <span className="text-sm font-bold text-gray-500 tabular-nums w-9 text-right">—</span>
          <span className="col-span-2 w-[104px] py-1 rounded-md text-[10px] text-center text-gray-500 bg-surface-3/60">
            no quotes yet
          </span>
        </>
      ) : (
        <>
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
        </>
      )}
    </Link>
  )
}

/**
 * Stacked odds bar for the bucket question (Yes prices sum to ~100%).
 * Percentages sit inside their segment; the price thresholds are drawn once,
 * at the segment boundaries, so nothing is repeated.
 */
function BucketBar({ rows }: { rows: SeriesRow[] }) {
  const books = useOrderBookStore((s) => s.books)
  const buckets = rows.filter((r) => !r.isBinary && r.kind !== 'other')
  if (buckets.length < 2) return null

  // A bucket's share is only "known" when its book is two-sided; unknown
  // buckets split whatever probability the known ones leave over, in grey.
  const known = buckets.map((r) => {
    const b = books[r.market.yesCoin]
    return !!(b && b.bids.length && b.asks.length)
  })
  if (!known.some(Boolean)) return null
  const vals = buckets.map((r, i) => {
    if (!known[i]) return 0
    const b = books[r.market.yesCoin]!
    return (parseFloat(b.bids[0].px) + parseFloat(b.asks[0].px)) / 2
  })
  const knownSum = vals.reduce((a, b) => a + b, 0)
  const nUnknown = known.filter((k) => !k).length
  const leftover = Math.max(0, 1 - knownSum)
  const shares = vals.map((v, i) => (known[i] ? v : leftover / Math.max(1, nUnknown)))
  const total = shares.reduce((a, b) => a + b, 0) || 1
  const pcts = shares.map((v) => (v / total) * 100)
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
            className={`${known[i] ? colors[i % colors.length] : 'bg-surface-3'} flex items-center justify-center overflow-hidden ${
              known[i] ? 'text-gray-950/80' : 'text-gray-500'
            }`}
            style={{ width: `${p}%` }}
            title={known[i] ? undefined : 'No quotes yet'}
          >
            {known[i] ? (p >= 9 ? `${Math.round(p)}%` : '') : p >= 9 ? '—' : ''}
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
  const bucketRows = series.rows.filter((r) => !r.isBinary)
  const binaryRows = series.rows.filter((r) => r.isBinary)

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
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-500">
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
        {bucketRows.map((row) => (
          <SeriesRowView key={row.market.outcomeId} row={row} tagBinary={series.hasBuckets} />
        ))}
      </div>

      {series.hasBuckets && <BucketBar rows={bucketRows} />}

      {/* Standalone binaries sit below the continuous bucket ladder */}
      {binaryRows.length > 0 && (
        <div className={`space-y-0.5 ${bucketRows.length ? 'mt-2 pt-2 border-t border-white/5' : ''}`}>
          {binaryRows.map((row) => (
            <SeriesRowView key={row.market.outcomeId} row={row} tagBinary={series.hasBuckets} />
          ))}
        </div>
      )}
    </div>
  )
}
