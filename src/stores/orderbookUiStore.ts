import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Aggregation tick for the order book display.
 *   '1c'    → 1¢   tick (one decimal of probability)
 *   '0.1c'  → 0.1¢ tick (two decimals of probability)
 *   '0.01c' → 0.01¢ tick (HL native, no aggregation)
 *
 * No 'auto' — instead, a smart default is computed once per coin from initial
 * book state (see `defaultPrecision`) and persisted. User can override via the
 * precision dropdown.
 */
export type Precision = '1c' | '0.1c' | '0.01c'

interface OrderBookUiStore {
  /** Per-coin precision override; absent = use computed default. */
  precisionByCoin: Record<string, Precision>
  setPrecision: (coin: string, p: Precision) => void
  getPrecision: (coin: string) => Precision | undefined
}

export const useOrderBookUiStore = create<OrderBookUiStore>()(
  persist(
    (set, get) => ({
      precisionByCoin: {},
      setPrecision: (coin, p) =>
        set((s) => ({ precisionByCoin: { ...s.precisionByCoin, [coin]: p } })),
      getPrecision: (coin) => {
        const v = get().precisionByCoin[coin]
        // Defensive: legacy 'auto' values (pre-migration) read as undefined
        return v === '1c' || v === '0.1c' || v === '0.01c' ? v : undefined
      },
    }),
    // Bumped key suffix so legacy 'auto' values don't leak in
    { name: 'verity-orderbook-ui-v2' },
  ),
)

/**
 * Pick a default precision for a coin from its initial book state. Called
 * once when the user first views a market that has no stored override; the
 * result is then persisted so it never reactively shifts.
 *
 * Bias is toward `1c` (the headline default) — only step finer for low-priced
 * markets where 1¢ would collapse most of the book into one row.
 *
 *   bestAsk ≥ 10¢   → 1c
 *   bestAsk 1–10¢   → 0.1c
 *   bestAsk < 1¢    → 0.01c
 */
export function defaultPrecision(bestAskCents: number): Precision {
  if (bestAskCents > 0 && bestAskCents < 1) return '0.01c'
  if (bestAskCents > 0 && bestAskCents < 10) return '0.1c'
  return '1c'
}

/**
 * Map Precision → display tick in "tenths of a basis point"
 * (100 = 1¢, 10 = 0.1¢, 1 = 0.01¢) — used by the client-side row formatter.
 */
export function precisionToTick(p: Precision): 1 | 10 | 100 {
  if (p === '1c') return 100
  if (p === '0.1c') return 10
  return 1
}
