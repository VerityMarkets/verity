import { create } from 'zustand'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { Trade } from '@/lib/hyperliquid/types'

interface TradeStore {
  trades: Trade[]
  coin: string | null
  subscribeTrades: (coin: string) => void
  unsubscribeTrades: () => void
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  trades: [],
  coin: null,

  subscribeTrades: (coin: string) => {
    const currentCoin = get().coin
    // Idempotent for same-coin re-subscribes so multiple consumers
    // (RecentTrades + ProbabilityChart) can call freely.
    if (currentCoin === coin) return
    if (currentCoin) {
      hlWebSocket.unsubscribe(`trades-${currentCoin}`)
    }

    set({ coin, trades: [] })

    hlWebSocket.subscribe(
      `trades-${coin}`,
      { type: 'trades', coin },
      (data) => {
        const newTrades = data as Trade[]
        if (!Array.isArray(newTrades)) return
        set((state) => {
          // HL re-sends the backlog on every (re)subscribe — drop seen trades.
          const seen = new Set(state.trades.map((t) => t.tid))
          const fresh = newTrades.filter((t) => t.coin === coin && !seen.has(t.tid))
          if (fresh.length === 0) return state
          // The initial backlog (and live multi-fill batches) arrive
          // oldest-first; the tape is kept newest-first.
          return {
            trades: [...fresh, ...state.trades].sort((a, b) => b.time - a.time).slice(0, 100),
          }
        })
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
