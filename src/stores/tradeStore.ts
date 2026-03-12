import { create } from 'zustand'
import { fetchRecentTrades } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { Trade } from '@/lib/hyperliquid/types'

interface TradeStore {
  trades: Trade[]
  coin: string | null
  fetchTrades: (coin: string) => Promise<void>
  subscribeTrades: (coin: string) => void
  unsubscribeTrades: () => void
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  trades: [],
  coin: null,

  fetchTrades: async (coin: string) => {
    try {
      const trades = await fetchRecentTrades(coin)
      set({ trades: trades.slice(0, 50), coin })
    } catch {
      // ignore
    }
  },

  subscribeTrades: (coin: string) => {
    const currentCoin = get().coin
    if (currentCoin) {
      hlWebSocket.unsubscribe(`trades-${currentCoin}`)
    }

    set({ coin })

    hlWebSocket.subscribe(
      `trades-${coin}`,
      { type: 'trades', coin },
      (data) => {
        const newTrades = data as Trade[]
        if (Array.isArray(newTrades)) {
          set((state) => ({
            trades: [...newTrades, ...state.trades].slice(0, 100),
          }))
        }
      }
    )
  },

  unsubscribeTrades: () => {
    const coin = get().coin
    if (coin) {
      hlWebSocket.unsubscribe(`trades-${coin}`)
      set({ coin: null, trades: [] })
    }
  },
}))
