import { useEffect, useMemo } from 'react'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import {
  useOrderBookUiStore,
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
  const round = side === 'ask' ? Math.ceil : Math.floor
  // HL prices carry up to 8 decimals (0.000001¢). Snap to that grid exactly
  // (float-safe), then quantize to 0.001¢ in the sweep-safe direction — a
  // plain Math.round here could land the display on the wrong side of the level.
  const nanocent = Math.round(parseFloat(priceStr) * 100_000_000) // 0.000001¢ units
  const microcent = round(nanocent / 1000)                         // 0.001¢ units
  let tick = tickTbp * 10                                          // 1¢=1000, 0.1¢=100, 0.01¢=10
  let ticks = round(microcent / tick)

  // Never display "0" for a non-zero bid or "100" for a sub-100% ask — both
  // are invalid limit prices. Step to a 10× finer tick (down to 0.001¢) until
  // the rounded value lies strictly inside (0, 100). Adjacent sub-tick levels
  // still aggregate at the finer tick, and sweep correctness is preserved.
  while (
    tick > 1 &&
    ((side === 'bid' && ticks === 0 && nanocent > 0) ||
      (side === 'ask' && ticks * tick >= 100_000 && nanocent < 100_000_000))
  ) {
    tick /= 10
    ticks = round(microcent / tick)
  }
  if (side === 'bid' && ticks === 0 && nanocent > 0) {
    // Below 0.001¢ — show the exact price (6 decimals of a cent)
    return (nanocent / 1_000_000).toFixed(6)
  }

  const cents = (ticks * tick) / 1000
  const decimals = tick === 1000 ? 0 : tick === 100 ? 1 : tick === 10 ? 2 : 3
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

  // Single full-precision book per coin (subscribed by MarketPage). All
  // precision bucketing is client-side below, so switching the dropdown is
  // instant and never re-subscribes. Granular selector: re-renders only when
  // this coin's book changes.
  const rawBook = useOrderBookStore((s) => s.books[coin])

  // Smart-default: pick precision once from the initial book, then persist.
  useEffect(() => {
    if (validStored) return
    const ba = parseFloat(rawBook?.asks?.[0]?.px ?? '0') * 100
    if (ba <= 0) return // wait for book
    setPrecision(coin, defaultPrecision(ba))
  }, [validStored, rawBook, coin, setPrecision])

  const bids = rawBook?.bids ?? []
  const asks = rawBook?.asks ?? []

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

    // Spread from the raw touch — exact regardless of display precision.
    const rawBa = parseFloat(asks[0]?.px ?? '0')
    const rawBb = parseFloat(bids[0]?.px ?? '0')

    return {
      displayAsks: [...aggAsks].reverse(),
      displayBids: aggBids,
      maxAskSize: maxAskSz,
      maxBidSize: maxBidSz,
      spreadCents: (rawBa - rawBb) * 100,
    }
    // openOrders ref is stable per portfolio refresh; bids/asks refs change
    // only when this coin's book updates (granular selector above).
  }, [bids, asks, openOrders, coin, tickTbp])

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
