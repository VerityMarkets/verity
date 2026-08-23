import { useOrderBookStore } from '@/stores/orderbookStore'
import { useMarketStore } from '@/stores/marketStore'

/**
 * Best available mid for an outcome coin:
 *   1. order-book mid when both sides are quoted (exact, updates per block)
 *   2. HL `allMids` otherwise (one-sided / empty books report 1.0 or 0.5 there)
 *   3. 0.5 placeholder
 * Granular selectors so callers only re-render when this coin moves.
 */
export function useMarketMid(coin: string): number {
  const bestBid = useOrderBookStore((s) => s.books[coin]?.bids?.[0]?.px)
  const bestAsk = useOrderBookStore((s) => s.books[coin]?.asks?.[0]?.px)
  const allMid = useMarketStore((s) => s.mids[coin])
  if (bestBid && bestAsk) return (parseFloat(bestBid) + parseFloat(bestAsk)) / 2
  if (allMid) return parseFloat(allMid)
  return 0.5
}

/**
 * Book state for a coin. `loaded` = a snapshot has arrived; `quoted` = at least
 * one side has levels; `twoSided` = both. Use to avoid showing HL's allMids
 * placeholder (0.5, or a stale last mid) as if it were a live price.
 */
export function useQuoteState(coin: string): { loaded: boolean; quoted: boolean; twoSided: boolean } {
  const nBids = useOrderBookStore((s) => s.books[coin]?.bids.length)
  const nAsks = useOrderBookStore((s) => s.books[coin]?.asks.length)
  const loaded = nBids !== undefined
  return {
    loaded,
    quoted: loaded && ((nBids ?? 0) > 0 || (nAsks ?? 0) > 0),
    twoSided: (nBids ?? 0) > 0 && (nAsks ?? 0) > 0,
  }
}

/** Non-reactive variant for event handlers / effects. */
export function getMarketMid(coin: string): number {
  const book = useOrderBookStore.getState().books[coin]
  const bid = book?.bids?.[0]?.px
  const ask = book?.asks?.[0]?.px
  if (bid && ask) return (parseFloat(bid) + parseFloat(ask)) / 2
  const allMid = useMarketStore.getState().mids[coin]
  return allMid ? parseFloat(allMid) : 0.5
}
