import { create } from 'zustand'
import { fetchL2Book } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { L2Level } from '@/lib/hyperliquid/types'

interface BookData {
  bids: L2Level[]
  asks: L2Level[]
}

interface OrderBookStore {
  books: Record<string, BookData>
  loading: boolean
  fetchBook: (coin: string) => Promise<void>
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
  loading: false,

  fetchBook: async (coin: string) => {
    set({ loading: true })
    try {
      const book = await fetchL2Book(coin)
      set((state) => ({
        books: {
          ...state.books,
          [coin]: {
            bids: book.levels[0] ?? [],
            asks: book.levels[1] ?? [],
          },
        },
        loading: false,
      }))
    } catch {
      set({ loading: false })
    }
  },

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
