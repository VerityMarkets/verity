import { useOrderBookStore } from '@/stores/orderbookStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import {
  useOrderBookUiStore,
  resolveTick,
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
  userPxSet: Set<string>,
): AggregatedLevel[] {
  const out: AggregatedLevel[] = []
  for (const lvl of levels) {
    const display = formatCents(lvl.px, side, tickTbp)
    const sz = parseFloat(lvl.sz)
    const usd = parseFloat(lvl.px) * sz
    const isUser = userPxSet.has(parseFloat(lvl.px).toFixed(8))
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
  { value: 'auto', label: 'Auto' },
  { value: '1c', label: '1¢' },
  { value: '0.1c', label: '0.1¢' },
  { value: '0.01c', label: '0.01¢' },
]

export function OrderBook({ coin }: { coin: string }) {
  const books = useOrderBookStore((s) => s.books)
  const openOrders = usePortfolioStore((s) => s.openOrders)
  const precision = useOrderBookUiStore((s) => s.precisionByCoin[coin] ?? 'auto')
  const setPrecision = useOrderBookUiStore((s) => s.setPrecision)

  const book = books[coin]
  const bids = book?.bids ?? []
  const asks = book?.asks ?? []

  // Resolve "auto" precision from magnitude + spread
  const bestAskCents = parseFloat(asks[0]?.px ?? '0') * 100
  const bestBidCents = parseFloat(bids[0]?.px ?? '0') * 100
  const tickTbp = resolveTick(precision, bestAskCents, bestBidCents)

  // Set of price levels where user has resting orders for this coin
  const userOrderPrices = new Set<string>()
  for (const order of openOrders) {
    if (order.coin === coin) {
      userOrderPrices.add(parseFloat(order.limitPx).toFixed(8))
    }
  }

  const aggregatedAsks = aggregate(asks, 'ask', tickTbp, userOrderPrices).slice(0, 8)
  const aggregatedBids = aggregate(bids, 'bid', tickTbp, userOrderPrices).slice(0, 8)

  const maxBidSize = Math.max(...aggregatedBids.map((b) => b.size), 1)
  const maxAskSize = Math.max(...aggregatedAsks.map((a) => a.size), 1)

  const displayAsks = [...aggregatedAsks].reverse()
  const displayBids = aggregatedBids

  // Spread (uses raw best bid/ask, not aggregated, so it's exact)
  const bestAsk = parseFloat(asks[0]?.px ?? '0')
  const bestBid = parseFloat(bids[0]?.px ?? '0')
  const spreadCents = (bestAsk - bestBid) * 100

  return (
    <div className="space-y-0.5">
        {/* Header w/ precision selector */}
        <div className="grid grid-cols-3 text-[10px] text-gray-500 uppercase font-mono pb-1 items-center">
          <div className="flex items-center gap-1">
            <span>Price</span>
            <select
              value={precision}
              onChange={(e) => setPrecision(coin, e.target.value as Precision)}
              className="bg-transparent border border-white/10 rounded px-1 py-px text-[9px] text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors cursor-pointer focus:outline-none focus:border-amber-400/50"
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
        {displayAsks.map((level, i) => {
          const sizeRatio = level.size / maxAskSize
          return (
            <button
              key={`a-${i}`}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('verity:set-limit-price', {
                    detail: { coin, price: level.display, size: Math.floor(level.size), bookSide: 'ask' },
                  }),
                )
              }
              className="relative grid grid-cols-3 text-xs font-mono py-0.5 w-full text-left hover:bg-white/5 transition-colors cursor-pointer rounded-sm"
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
        {displayBids.map((level, i) => {
          const sizeRatio = level.size / maxBidSize
          return (
            <button
              key={`b-${i}`}
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('verity:set-limit-price', {
                    detail: { coin, price: level.display, size: Math.floor(level.size), bookSide: 'bid' },
                  }),
                )
              }
              className="relative grid grid-cols-3 text-xs font-mono py-0.5 w-full text-left hover:bg-white/5 transition-colors cursor-pointer rounded-sm"
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
