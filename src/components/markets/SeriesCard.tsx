import { useState } from 'react'
import { useRowOrder } from '@/hooks/useRowOrder'
import type { Series } from '@/lib/series'
import { SeriesHeader } from './SeriesHeader'
import { SeriesRowView, SingleRowView } from './SeriesRows'
import { BucketBar } from './BucketBar'

/** Question members shown before the card offers to expand. */
const ROW_CAP = 5

/**
 * Protocol price ladder: the bucket rows in price order, the stacked odds bar
 * under them, and any standalone binary below a hairline. Untouched by the
 * other layouts — this is the only shape mainnet lists today.
 */
function PriceLayout({ series }: { series: Series }) {
  const bucketRows = series.rows.filter((r) => !r.isBinary)
  const binaryRows = series.rows.filter((r) => r.isBinary)

  return (
    <>
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
    </>
  )
}

/**
 * Named outcomes of one question ("Spain" / "Draw" / "Cape Verde"), likeliest
 * first. A 16-country field would otherwise make a card taller than the screen,
 * so everything past `ROW_CAP` hides behind an expander.
 */
function QuestionLayout({ series }: { series: Series }) {
  const [expanded, setExpanded] = useState(false)
  const rows = useRowOrder(series.rows, true)
  const hidden = rows.length - ROW_CAP
  const shown = expanded ? rows : rows.slice(0, ROW_CAP)

  return (
    <>
      <div className="space-y-0.5">
        {shown.map((row) => (
          <SeriesRowView key={row.market.outcomeId} row={row} tagBinary={false} />
        ))}
      </div>
      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full py-1 rounded-md text-[11px] font-semibold text-gray-400 hover:text-amber-400 hover:bg-white/5 transition-colors"
        >
          {expanded ? 'Show less' : `+${hidden} more`}
        </button>
      )}
    </>
  )
}

/** A standalone market — one Yes/No pair, no rows to list. */
function SingleLayout({ series }: { series: Series }) {
  const market = series.rows[0]?.market
  if (!market) return null
  return <SingleRowView market={market} />
}

export function SeriesCard({ series }: { series: Series }) {
  return (
    <div className="card p-4 hover:border-amber-500/20 transition-all break-inside-avoid mb-4">
      <SeriesHeader series={series} />
      {series.kind === 'price' ? (
        <PriceLayout series={series} />
      ) : series.kind === 'question-member' ? (
        <QuestionLayout series={series} />
      ) : (
        <SingleLayout series={series} />
      )}
    </div>
  )
}
