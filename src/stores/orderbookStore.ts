import { create } from 'zustand'
import { fetchL2Book } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { L2Level } from '@/lib/hyperliquid/types'

interface OrderBookStore {
  bids: L2Level[]
  asks: L2Level[]
  coin: string | null
  loading: boolean
  fetchBook: (coin: string) => Promise<void>
  subscribeBook: (coin: string) => void
  unsubscribeBook: () => void
}

export const useOrderBookStore = create<OrderBookStore>((set, get) => ({
  bids: [],
  asks: [],
  coin: null,
  loading: false,

  fetchBook: async (coin: string) => {
    set({ loading: true })
    try {
      const book = await fetchL2Book(coin)
      set({
        bids: book.levels[0] ?? [],
        asks: book.levels[1] ?? [],
        coin,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  subscribeBook: (coin: string) => {
    const currentCoin = get().coin
    if (currentCoin) {
      hlWebSocket.unsubscribe(`l2Book-${currentCoin}`)
    }

    set({ coin })

    hlWebSocket.subscribe(
      `l2Book-${coin}`,
      { type: 'l2Book', coin },
      (data) => {
        const bookData = data as { levels: [L2Level[], L2Level[]] }
        if (bookData.levels) {
          set({
            bids: bookData.levels[0] ?? [],
            asks: bookData.levels[1] ?? [],
          })
        }
      }
    )
  },

  unsubscribeBook: () => {
    const coin = get().coin
    if (coin) {
      hlWebSocket.unsubscribe(`l2Book-${coin}`)
      set({ coin: null, bids: [], asks: [] })
    }
  },
}))
