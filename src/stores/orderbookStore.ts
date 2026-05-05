import { create } from 'zustand'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { L2Level } from '@/lib/hyperliquid/types'

interface BookData {
  bids: L2Level[]
  asks: L2Level[]
}

/**
 * Significant-figure precisions HL accepts for `l2Book`. We pre-subscribe to
 * all four per coin and store the books separately, so the OrderBook display
 * can switch between them instantly (no WS round-trip, no data flicker).
 */
export type SigFig = 2 | 3 | 4 | 5
export const SIG_FIGS: readonly SigFig[] = [2, 3, 4, 5]

/** sf5 is HL's max precision and acts as the "raw" book — used by spread,
 *  TradeForm fill prices, MarketHeader, etc. */
export const RAW_SF: SigFig = 5

/**
 * Count significant figures in a price string. Used to demux the four
 * concurrent `l2Book` streams since HL doesn't echo `nSigFigs` in the
 * channel updates — but the data itself reflects the requested precision
 * (a price like "0.49" comes from the `nSigFigs:2` stream; "0.4923" from
 * `nSigFigs:4`; etc.).
 */
function sigFigsOf(s: string): number {
  let started = false
  let count = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '.' || c === '-') continue
    if (c === '0' && !started) continue
    started = true
    count++
  }
  return count
}

function maxSigFigsOf(levels: L2Level[]): number {
  let max = 0
  for (const l of levels) {
    const s = sigFigsOf(l.px)
    if (s > max) max = s
  }
  return max
}

interface OrderBookStore {
  /** Per-coin books indexed by sig figs. `books[coin][5]` is full precision
   *  ("raw"); `books[coin][2]` is the 1¢-bucket aggregation; etc. Slots are
   *  populated independently as each HL stream's first message arrives. */
  books: Record<string, Partial<Record<SigFig, BookData>>>

  subscribeBook: (coin: string) => void
  unsubscribeBook: (coin: string) => void
  unsubscribeAll: () => void

  /** Best book available — prefers raw (sf5), falls back to coarser. */
  getBestBook: (coin: string) => BookData | undefined
  getBids: (coin: string) => L2Level[]
  getAsks: (coin: string) => L2Level[]
  getBestBid: (coin: string) => number
  getBestAsk: (coin: string) => number
}

const subId = (coin: string) => `l2Book-${coin}`

function bestBookFor(slots: Partial<Record<SigFig, BookData>> | undefined): BookData | undefined {
  if (!slots) return undefined
  // Prefer most precise. Falls through to coarser slots if the most precise
  // one's first message hasn't arrived yet.
  return slots[5] ?? slots[4] ?? slots[3] ?? slots[2]
}

export const useOrderBookStore = create<OrderBookStore>((set, get) => ({
  books: {},

  subscribeBook: (coin: string) => {
    // Fan out: one local id, four HL subscriptions (one per nSigFigs).
    // The single shared handler demuxes incoming messages by counting sig
    // figs in the level prices and writes to the matching slot. Cheap-dedupes
    // identical writes (same best px + same depth) so React only re-renders
    // when the slot actually changes.
    hlWebSocket.subscribe(
      subId(coin),
      SIG_FIGS.map((nSigFigs) => ({ type: 'l2Book', coin, nSigFigs })),
      (data) => {
        const bookData = data as { coin?: string; levels?: [L2Level[], L2Level[]] }
        if (!bookData?.levels) return
        const bids = bookData.levels[0] ?? []
        const asks = bookData.levels[1] ?? []
        if (bids.length === 0 && asks.length === 0) return

        const inferred = maxSigFigsOf([...bids, ...asks])
        // Clamp into our known SigFig range. HL strips trailing zeros so a
        // sf5 stream with prices like "0.5" can read as 1 sig fig — clamp
        // up to nearest valid slot.
        const slot: SigFig = (inferred <= 2 ? 2 : inferred >= 5 ? 5 : (inferred as SigFig))

        set((state) => {
          const existing = state.books[coin]?.[slot]
          // Cheap dedupe: same best px + same depth = same snapshot, skip.
          if (
            existing &&
            existing.bids.length === bids.length &&
            existing.asks.length === asks.length &&
            existing.bids[0]?.px === bids[0]?.px &&
            existing.asks[0]?.px === asks[0]?.px &&
            existing.bids[0]?.sz === bids[0]?.sz &&
            existing.asks[0]?.sz === asks[0]?.sz
          ) {
            return state
          }
          return {
            books: {
              ...state.books,
              [coin]: {
                ...(state.books[coin] || {}),
                [slot]: { bids, asks },
              },
            },
          }
        })
      },
    )
  },

  unsubscribeBook: (coin: string) => {
    hlWebSocket.unsubscribe(subId(coin))
    set((state) => {
      const { [coin]: _, ...rest } = state.books
      return { books: rest }
    })
  },

  unsubscribeAll: () => {
    const { books } = get()
    for (const coin of Object.keys(books)) {
      hlWebSocket.unsubscribe(subId(coin))
    }
    set({ books: {} })
  },

  getBestBook: (coin: string) => bestBookFor(get().books[coin]),

  getBids: (coin: string) => bestBookFor(get().books[coin])?.bids ?? [],
  getAsks: (coin: string) => bestBookFor(get().books[coin])?.asks ?? [],

  getBestBid: (coin: string) => {
    const bids = bestBookFor(get().books[coin])?.bids
    return bids?.length ? parseFloat(bids[0].px) : 0
  },

  getBestAsk: (coin: string) => {
    const asks = bestBookFor(get().books[coin])?.asks
    return asks?.length ? parseFloat(asks[0].px) : 0
  },
}))
