import { useOrderBookStore } from '@/stores/orderbookStore'
import { compactUsd, type SeriesRow } from '@/lib/series'

/**
 * Stacked odds bar for the bucket question (Yes prices sum to ~100%).
 * Percentages sit inside their segment; the price thresholds are drawn once,
 * at the segment boundaries, so nothing is repeated.
 *
 * Price series only — a question's named outcomes have no ordering to lay out
 * along an axis.
 */
export function BucketBar({ rows }: { rows: SeriesRow[] }) {
  const books = useOrderBookStore((s) => s.books)
  const buckets = rows.filter((r) => !r.isBinary && r.kind !== 'other')
  if (buckets.length < 2) return null

  // A bucket's share is only "known" when its book is two-sided; unknown
  // buckets split whatever probability the known ones leave over and show
  // "—". Colour always encodes the price range (red low → green high), not
  // whether the bucket is priced, so unknown segments keep their hue (dimmed).
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
  // same hues, dimmed fill for unpriced buckets (text stays full strength)
  const dimColors = ['bg-no/40', 'bg-amber-400/45', 'bg-yes/40', 'bg-blue-400/40', 'bg-purple-400/40']
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
            className={`${known[i] ? colors[i % colors.length] : dimColors[i % dimColors.length]} flex items-center justify-center overflow-hidden text-gray-950/80`}
            style={{
              width: `${p}%`,
              // Unpriced: hatch the segment (gray-400, same as the threshold
              // labels) over its range colour instead of printing a value.
              ...(known[i]
                ? {}
                : { backgroundImage: 'repeating-linear-gradient(-45deg, rgba(156,163,175,0.3) 0 2px, transparent 2px 7px)' }),
            }}
            title={known[i] ? undefined : 'No quotes yet'}
          >
            {known[i] && p >= 9 ? `${Math.round(p)}%` : ''}
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
