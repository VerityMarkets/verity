import { useEffect, useMemo } from 'react'
import { useOrderBookStore, RAW_SF } from '@/stores/orderbookStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import {
  useOrderBookUiStore,
  precisionToNSigFigs,
  precisionToTick,
  defaultPrecision,
  type Precision,
} from '@/stores/orderbookUiStore'

/**
 * Format a 0–1 probability price as cents at a chosen tick, rounding in the
 * direction that makes the displayed price a valid sweep target for that side:
 *
 *   asks → ceil up   (a buy limit at the displayed price clears all asks ≤ it)
 *   bids → floor down (a sell limit at the displayed price clears all bids ≥ it)
 *
 * `tickTbp` is the display tick in "tenths of a basis point":
 *   100 = 1¢, 10 = 0.1¢, 1 = 0.01¢.
 *
 * Internally we work in micro-cents (price × 100,000 = 0.001¢ units) so we can
 * still represent prices below the chosen tick — bids that would floor to 0
 * are instead shown at finer precision (the actual price), preserving sweep
 * correctness without ever displaying "0¢" as a fake limit.
 *
 * Trailing zeros are preserved at the chosen tick (e.g. "1.0" at 0.1¢ tick).
 */
function formatCents(priceStr: string, side: 'ask' | 'bid', tickTbp: 1 | 10 | 100): string {
  const microcent = Math.round(parseFloat(priceStr) * 100_000) // 0.001¢ units
  const microTick = tickTbp * 10                                // 1¢=1000, 0.1¢=100, 0.01¢=10
  const round = side === 'ask' ? Math.ceil : Math.floor
  const ticks = round(microcent / microTick)

  // Bids must never display "0" for a non-zero price. Drop to a 10× finer tick
  // so adjacent sub-tick bids still aggregate (sweep correctness preserved —
  // a sell limit at the displayed price clears every bid in the bucket).
  if (side === 'bid' && ticks === 0 && microcent > 0) {
    const fineTick = Math.max(1, microTick / 10) // 1¢→0.1¢, 0.1¢→0.01¢, 0.01¢→0.001¢
    const fineTicks = Math.floor(microcent / fineTick)
    if (fineTicks > 0) {
      const cents = (fineTicks * fineTick) / 1000
      const fineDecimals = fineTick === 100 ? 1 : fineTick === 10 ? 2 : 3
      return cents.toFixed(fineDecimals)
    }
    // Sub-0.001¢ extreme — show actual at HL fineness
    return (microcent / 1000).toFixed(3)
  }

  const cents = (ticks * microTick) / 1000
  const decimals = tickTbp === 100 ? 0 : tickTbp === 10 ? 1 : 2
  return cents.toFixed(decimals)
}

/** Format spread in cents, picking enough precision so it's never "0.0¢" for
 *  a non-zero spread. */
function formatSpread(spreadCents: number): string {
  if (spreadCents <= 0) return '0'
  if (spreadCents >= 1) return spreadCents.toFixed(1)
  if (spreadCents >= 0.01) return spreadCents.toFixed(2)
  return spreadCents.toFixed(3)
}

interface RawLevel { px: string; sz: string }
interface AggregatedLevel {
  display: string
  size: number
  totalUsd: number
  hasUserOrder: boolean
}

/**
 * Group adjacent levels that share the same display-formatted price.
 * Sizes and $-totals are summed. Order is preserved (input must be sorted).
 */
function aggregate(
  levels: RawLevel[],
  side: 'ask' | 'bid',
  tickTbp: 1 | 10 | 100,
  userBuckets: Set<string>,
): AggregatedLevel[] {
  const out: AggregatedLevel[] = []
  for (const lvl of levels) {
    const display = formatCents(lvl.px, side, tickTbp)
    const sz = parseFloat(lvl.sz)
    const usd = parseFloat(lvl.px) * sz
    const isUser = userBuckets.has(display)
    const last = out[out.length - 1]
    if (last && last.display === display) {
      last.size += sz
      last.totalUsd += usd
      last.hasUserOrder ||= isUser
    } else {
      out.push({ display, size: sz, totalUsd: usd, hasUserOrder: isUser })
    }
  }
  return out
}

const PRECISION_OPTIONS: { value: Precision; label: string }[] = [
  { value: '1c', label: '1¢' },
  { value: '0.1c', label: '0.1¢' },
  { value: '0.01c', label: '0.01¢' },
]

const FALLBACK_PRECISION: Precision = '1c'

export function OrderBook({ coin }: { coin: string }) {
  const openOrders = usePortfolioStore((s) => s.openOrders)
  const storedPrecision = useOrderBookUiStore((s) => s.precisionByCoin[coin])
  const setPrecision = useOrderBookUiStore((s) => s.setPrecision)

  const validStored: Precision | undefined =
    storedPrecision === '1c' || storedPrecision === '0.1c' || storedPrecision === '0.01c'
      ? storedPrecision
      : undefined
  const precision: Precision = validStored ?? FALLBACK_PRECISION
  const nSigFigs = precisionToNSigFigs(precision)

  // Pre-loaded slots at all four sig-fig precisions; we read just the two we
  // need (chosen for display, raw for accurate spread + smart-default seed).
  // Per-slot granular selectors mean a tick in *another* slot doesn't trigger
  // a re-render here. Selecting raw twice (when chosen===raw) is harmless —
  // zustand will return the same reference.
  const displayBook = useOrderBookStore((s) => s.books[coin]?.[nSigFigs])
  const rawBook = useOrderBookStore((s) => s.books[coin]?.[RAW_SF])

  // Smart-default: pick precision once based on initial book state, then
  // persist. Reads sf5 (raw) since it's available regardless of which
  // precision the user ends up choosing.
  useEffect(() => {
    if (validStored) return
    const ba = parseFloat(rawBook?.asks?.[0]?.px ?? '0') * 100
    if (ba <= 0) return // wait for book
    setPrecision(coin, defaultPrecision(ba))
  }, [validStored, rawBook, coin, setPrecision])

  // Display falls back to raw while the chosen-precision slot is still
  // loading its first message — keeps rows visible during initial load.
  const book = displayBook ?? rawBook
  const bids = book?.bids ?? []
  const asks = book?.asks ?? []

  const tickTbp = precisionToTick(precision)

  // Memoize the heavy work so identical snapshots don't re-walk the rows.
  // Keyed on the actual data we depend on (length is a cheap heuristic +
  // best-px shifts catch updates). We rely on book reference identity for the
  // hot path — granular zustand selectors only mint new objects when this
  // coin actually changes.
  const { displayAsks, displayBids, maxAskSize, maxBidSize, spreadCents } = useMemo(() => {
    // User-order buckets at current tick, so the ⭐ marker survives server-
    // side aggregation (display match instead of raw-px match).
    const userBuckets = new Set<string>()
    for (const order of openOrders) {
      if (order.coin === coin) {
        const dir: 'ask' | 'bid' = order.side === 'B' ? 'bid' : 'ask'
        userBuckets.add(formatCents(order.limitPx, dir, tickTbp))
      }
    }

    const aggAsks = aggregate(asks, 'ask', tickTbp, userBuckets).slice(0, 12)
    const aggBids = aggregate(bids, 'bid', tickTbp, userBuckets).slice(0, 12)

    const maxAskSz = Math.max(...aggAsks.map((a) => a.size), 1)
    const maxBidSz = Math.max(...aggBids.map((b) => b.size), 1)

    // Spread is read from the RAW (sf5) book so it's accurate regardless of
    // which display precision the user has selected — no rounding error.
    const rawBa = parseFloat(rawBook?.asks?.[0]?.px ?? '0')
    const rawBb = parseFloat(rawBook?.bids?.[0]?.px ?? '0')

    return {
      displayAsks: [...aggAsks].reverse(),
      displayBids: aggBids,
      maxAskSize: maxAskSz,
      maxBidSize: maxBidSz,
      spreadCents: (rawBa - rawBb) * 100,
    }
    // openOrders ref is stable per portfolio refresh; bids/asks refs change
    // only when this coin's book updates (granular selector above).
  }, [bids, asks, rawBook, openOrders, coin, tickTbp])

  return (
    // `overflow-anchor: none` opts the OrderBook out of being the browser's
    //   scroll anchor element — when row count changes (precision change,
    //   thin book, etc.), the browser anchors on stable content above
    //   (chart / market header) instead of trying to anchor on a row that
    //   may no longer exist, which prevents the page from snapping up.
    // `contain: layout` keeps OrderBook's internal layout reflows from
    //   rippling to siblings.
    <div className="space-y-0.5 [overflow-anchor:none] [contain:layout]">
        {/* Header w/ precision selector */}
        <div className="grid grid-cols-3 text-[10px] text-gray-500 uppercase font-mono pb-1 items-center">
          <div className="flex items-center gap-1">
            <span>Price</span>
            <select
              value={precision}
              onChange={(e) => setPrecision(coin, e.target.value as Precision)}
              className="bg-transparent border border-white/10 rounded px-1 py-px text-[9px] text-gray-400 hover:text-gray-200 hover:border-white/20 cursor-pointer focus:outline-none focus:border-amber-400/50"
              aria-label="Price precision"
            >
              {PRECISION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-surface-2">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <span className="text-right">Size</span>
          <span className="text-right">Total</span>
        </div>

        {/* Asks (sells) — click to prefill a buy at this price */}
        {displayAsks.map((level) => {
          const sizeRatio = level.size / maxAskSize
          return (
            <button
              key={`a-${level.display}`}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('verity:set-limit-price', {
                    detail: { coin, price: level.display, size: Math.floor(level.size), bookSide: 'ask' },
                  }),
                )
              }
              className="relative grid grid-cols-3 text-xs font-mono py-0.5 w-full text-left hover:bg-white/5 cursor-pointer rounded-sm"
            >
              <div
                className="absolute inset-0 bg-no/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-no relative flex items-center">
                {level.hasUserOrder && (
                  <span className="text-amber-400 text-[10px] absolute -left-3">★</span>
                )}
                {level.display}¢
              </span>
              <span className="text-right text-gray-300 relative">
                {level.size.toFixed(0)}
              </span>
              <span className="text-right text-white relative">
                ${level.totalUsd.toFixed(2)}
              </span>
            </button>
          )
        })}

        {/* Spread */}
        <div className="py-1 text-center">
          <span className="text-[10px] text-gray-500 font-mono">
            {bids.length > 0 && asks.length > 0
              ? `Spread: ${formatSpread(spreadCents)}¢`
              : 'No orders'}
          </span>
        </div>

        {/* Bids (buys) — click to prefill a sell at this price */}
        {displayBids.map((level) => {
          const sizeRatio = level.size / maxBidSize
          return (
            <button
              key={`b-${level.display}`}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('verity:set-limit-price', {
                    detail: { coin, price: level.display, size: Math.floor(level.size), bookSide: 'bid' },
                  }),
                )
              }
              className="relative grid grid-cols-3 text-xs font-mono py-0.5 w-full text-left hover:bg-white/5 cursor-pointer rounded-sm"
            >
              <div
                className="absolute inset-0 bg-yes/8 rounded-sm"
                style={{ width: `${sizeRatio * 100}%`, right: 0, left: 'auto' }}
              />
              <span className="text-yes relative flex items-center">
                {level.hasUserOrder && (
                  <span className="text-amber-400 text-[10px] absolute -left-3">★</span>
                )}
                {level.display}¢
              </span>
              <span className="text-right text-gray-300 relative">
                {level.size.toFixed(0)}
              </span>
              <span className="text-right text-white relative">
                ${level.totalUsd.toFixed(2)}
              </span>
            </button>
          )
        })}
    </div>
  )
}
