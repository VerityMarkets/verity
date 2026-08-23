import { Link, useNavigate } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { useMarketMid, useQuoteState } from '@/hooks/useMarketMid'
import { formatPriceCents } from '@/lib/marketFormat'
import { isYesNoPair, sideButtonLabel } from '@/lib/marketDisplay'
import { rowGlyph, type SeriesRow } from '@/lib/series'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

function RowIcon({ kind }: { kind: SeriesRow['kind'] }) {
  const g = rowGlyph(kind)
  if (!g) return null
  return <span className={kind === 'below' ? 'text-no' : 'text-yes'}>{g} </span>
}

/** Open the market with one side pre-selected in the trade form. */
function useSideNav(outcomeId: number) {
  const navigate = useNavigate()
  return (side: 'yes' | 'no') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    useMarketStore.getState().setTradeSide(side)
    navigate(`/market/${outcomeId}`)
  }
}

/** Shown instead of prices while nobody has quoted the outcome. */
function NoQuotes() {
  return (
    <>
      <span className="text-sm font-bold text-gray-500 tabular-nums w-9 text-right">—</span>
      <span className="col-span-2 w-[104px] py-1 rounded-md text-[10px] text-center text-gray-500 bg-surface-3/60">
        no quotes yet
      </span>
    </>
  )
}

/**
 * One ladder step (price series) or one named outcome of a question — always a
 * Yes/No pair, so the buttons stay bare cents.
 */
export function SeriesRowView({ row, tagBinary }: { row: SeriesRow; tagBinary: boolean }) {
  const m = row.market
  const yes = useMarketMid(m.yesCoin)
  const { loaded, quoted } = useQuoteState(m.yesCoin)
  const unquoted = loaded && !quoted
  const pct = Math.round(yes * 100)
  const go = useSideNav(m.outcomeId)

  return (
    <Link
      to={`/market/${m.outcomeId}`}
      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-white/5 transition-colors ${
        tagBinary && row.isBinary ? 'bg-amber-500/[0.06]' : ''
      }`}
    >
      {/* Price rows are short and must stay on one line; text rows (question
          members) wrap instead of overlapping the prices. */}
      <span
        className={`text-sm text-gray-200 min-w-0 ${
          row.kind === 'other' ? 'break-words leading-snug' : 'whitespace-nowrap tabular-nums'
        }`}
      >
        <RowIcon kind={row.kind} />
        {row.label}
        {tagBinary && row.isBinary && (
          <span className="ml-1 text-[9px] uppercase tracking-wide text-amber-400/80 font-semibold">bin</span>
        )}
      </span>
      {unquoted ? (
        <NoQuotes />
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
 * The body of a single-market card. The card title already says what the market
 * is, so the row carries only the odds: side A's name and probability, then a
 * button per side. Named sides ("MIN"/"BAL", "Over"/"Under") go on the buttons;
 * a plain Yes/No pair leaves them as bare cents, since the colours say it.
 *
 * Buttons wrap to their own line on a narrow card rather than truncating a
 * team name.
 */
export function SingleRowView({ market }: { market: ParsedMarket }) {
  const yes = useMarketMid(market.yesCoin)
  const { loaded, quoted } = useQuoteState(market.yesCoin)
  const unquoted = loaded && !quoted
  const named = !isYesNoPair(market.sideNames)
  const go = useSideNav(market.outcomeId)

  return (
    <Link
      to={`/market/${market.outcomeId}`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 -mx-2 rounded-md hover:bg-white/5 transition-colors"
    >
      <span className="text-sm text-gray-200 leading-snug break-words min-w-0">
        {market.sideNames[0]}
      </span>
      {unquoted ? (
        <>
          <span className="text-sm font-bold text-gray-500 tabular-nums">—</span>
          <span className="ml-auto w-[104px] py-1 rounded-md text-[10px] text-center text-gray-500 bg-surface-3/60">
            no quotes yet
          </span>
        </>
      ) : (
        <>
          <span className="text-sm font-bold text-gray-100 tabular-nums">{Math.round(yes * 100)}%</span>
          <span className="ml-auto flex items-center gap-2">
            <button
              onClick={go('yes')}
              className="min-w-12 px-2 py-1 rounded-md text-xs font-semibold bg-yes/15 text-yes hover:bg-yes/25 transition-colors tabular-nums"
            >
              {sideButtonLabel(market.sideNames[0], formatPriceCents(yes), named)}
            </button>
            <button
              onClick={go('no')}
              className="min-w-12 px-2 py-1 rounded-md text-xs font-semibold bg-no/15 text-no hover:bg-no/25 transition-colors tabular-nums"
            >
              {sideButtonLabel(market.sideNames[1], formatPriceCents(1 - yes), named)}
            </button>
          </span>
        </>
      )}
    </Link>
  )
}
