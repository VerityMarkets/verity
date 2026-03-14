import { create } from 'zustand'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { L2Level } from '@/lib/hyperliquid/types'

interface BookData {
  bids: L2Level[]
  asks: L2Level[]
}

interface OrderBookStore {
  books: Record<string, BookData>
  subscribeBook: (coin: string) => void
  unsubscribeBook: (coin: string) => void
  unsubscribeAll: () => void
  getBids: (coin: string) => L2Level[]
  getAsks: (coin: string) => L2Level[]
  getBestBid: (coin: string) => number
  getBestAsk: (coin: string) => number
}

export const useOrderBookStore = create<OrderBookStore>((set, get) => ({
  books: {},

  subscribeBook: (coin: string) => {
    // Avoid duplicate subscriptions
    const subId = `l2Book-${coin}`

    hlWebSocket.subscribe(
      subId,
      { type: 'l2Book', coin },
      (data) => {
        const bookData = data as { levels: [L2Level[], L2Level[]] }
        if (bookData.levels) {
          set((state) => ({
            books: {
              ...state.books,
              [coin]: {
                bids: bookData.levels[0] ?? [],
                asks: bookData.levels[1] ?? [],
              },
            },
          }))
        }
      }
    )
  },

  unsubscribeBook: (coin: string) => {
    hlWebSocket.unsubscribe(`l2Book-${coin}`)
    set((state) => {
      const { [coin]: _, ...rest } = state.books
      return { books: rest }
    })
  },

  unsubscribeAll: () => {
    const { books } = get()
    for (const coin of Object.keys(books)) {
      hlWebSocket.unsubscribe(`l2Book-${coin}`)
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
