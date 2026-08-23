import { create } from 'zustand'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { L2Level } from '@/lib/hyperliquid/types'

export interface BookData {
  bids: L2Level[]
  asks: L2Level[]
}

/**
 * One full-precision `l2Book` stream per coin (20 levels/side, HL max).
 *
 * Why not server-side `nSigFigs` aggregation (verified on mainnet, Aug 2026):
 *  - HL does not echo `nSigFigs` in book frames, and for most outcome books
 *    the 2/3/4/5 streams are byte-identical, so multiple precisions on one
 *    socket cannot be demuxed reliably.
 *  - HL's aggregation clamps sub-tick bids *up* to one tick, which breaks the
 *    sweep guarantee (a sell limit at the displayed bid would not cross).
 * All display bucketing is therefore done client-side in OrderBook.tsx with
 * directional rounding (asks ceil / bids floor).
 */
interface OrderBookStore {
  books: Record<string, BookData | undefined>
  subscribeBook: (coin: string) => void
  unsubscribeBook: (coin: string) => void
  unsubscribeAll: () => void
  getBids: (coin: string) => L2Level[]
  getAsks: (coin: string) => L2Level[]
  getBestBid: (coin: string) => number
  getBestAsk: (coin: string) => number
}

const subId = (coin: string) => `l2Book-${coin}`

/** l2Book is a snapshot feed (pushed every block even when unchanged), so
 *  compare every level — a change at depth 2..20 with an unchanged top of
 *  book is still a new snapshot. */
function sameLevels(a: L2Level[], b: L2Level[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].px !== b[i].px || a[i].sz !== b[i].sz) return false
  }
  return true
}

export const useOrderBookStore = create<OrderBookStore>((set, get) => ({
  books: {},

  subscribeBook: (coin: string) => {
    if (hlWebSocket.isSubscribed(subId(coin))) return
    // Seed the key so unsubscribeAll() covers this coin even if the stream
    // never delivers (empty book, or WS not open yet).
    set((state) => (coin in state.books ? state : { books: { ...state.books, [coin]: undefined } }))

    hlWebSocket.subscribe(subId(coin), { type: 'l2Book', coin }, (data) => {
      const d = data as { levels?: [L2Level[], L2Level[]] }
      if (!d?.levels) return
      const bids = d.levels[0] ?? []
      const asks = d.levels[1] ?? []
      set((state) => {
        const ex = state.books[coin]
        // Write empty books too — a book that empties out (pre-settlement)
        // must not keep showing stale liquidity.
        if (ex && sameLevels(ex.bids, bids) && sameLevels(ex.asks, asks)) return state
        return { books: { ...state.books, [coin]: { bids, asks } } }
      })
    })
  },

  unsubscribeBook: (coin: string) => {
    hlWebSocket.unsubscribe(subId(coin))
    set((state) => {
      if (!(coin in state.books)) return state
      const { [coin]: _, ...rest } = state.books
      return { books: rest }
    })
  },

  unsubscribeAll: () => {
    for (const coin of Object.keys(get().books)) {
      hlWebSocket.unsubscribe(subId(coin))
    }
    set({ books: {} })
  },

  getBids: (coin: string) => get().books[coin]?.bids ?? [],
  getAsks: (coin: string) => get().books[coin]?.asks ?? [],

  getBestBid: (coin: string) => {
    const bids = get().books[coin]?.bids
    return bids?.length ? parseFloat(bids[0].px) : 0
  },

  getBestAsk: (coin: string) => {
    const asks = get().books[coin]?.asks
    return asks?.length ? parseFloat(asks[0].px) : 0
  },
}))
