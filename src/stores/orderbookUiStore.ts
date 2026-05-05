import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Aggregation tick for the order book display.
 *   'auto'  → derived from price magnitude (1¢ when ≥ 1¢, 0.1¢ when ≥ 0.1¢, else 0.01¢)
 *   '1c'    → 1¢   tick (one decimal of probability)
 *   '0.1c'  → 0.1¢ tick (two decimals of probability)
 *   '0.01c' → 0.01¢ tick (HL native, no aggregation)
 */
export type Precision = 'auto' | '1c' | '0.1c' | '0.01c'

interface OrderBookUiStore {
  /** Per-coin precision override; absent = 'auto'. */
  precisionByCoin: Record<string, Precision>
  setPrecision: (coin: string, p: Precision) => void
  getPrecision: (coin: string) => Precision
}

export const useOrderBookUiStore = create<OrderBookUiStore>()(
  persist(
    (set, get) => ({
      precisionByCoin: {},
      setPrecision: (coin, p) =>
        set((s) => ({ precisionByCoin: { ...s.precisionByCoin, [coin]: p } })),
      getPrecision: (coin) => get().precisionByCoin[coin] ?? 'auto',
    }),
    { name: 'verity-orderbook-ui' },
  ),
)

/**
 * Resolve a precision setting + book context to a concrete display tick
 * (in "tenths of a basis point" — 100 = 1¢, 10 = 0.1¢, 1 = 0.01¢).
 *
 * Auto rule combines magnitude AND spread so books cluster aren't collapsed
 * into 2–3 rows. Target: ≥ ~4 distinct rows of separation across the spread.
 *
 *   - sub-0.1¢ markets always finest (0.01¢)
 *   - sub-1¢ markets default to 0.1¢
 *   - else: pick tick ≤ spread / 4 so the visible book has differentiation
 */
export function resolveTick(
  precision: Precision,
  bestAskCents: number,
  bestBidCents: number,
): 1 | 10 | 100 {
  if (precision === '1c') return 100
  if (precision === '0.1c') return 10
  if (precision === '0.01c') return 1
  // auto — magnitude floor for low-probability markets
  if (bestAskCents > 0 && bestAskCents < 0.1) return 1
  if (bestAskCents > 0 && bestAskCents < 1) return 10
  // Spread-driven: finer tick when book is tight
  const spread = bestAskCents > 0 && bestBidCents > 0 ? bestAskCents - bestBidCents : Infinity
  if (spread >= 4) return 100
  if (spread >= 0.4) return 10
  return 1
}
