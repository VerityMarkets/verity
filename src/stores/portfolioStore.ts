import { create } from 'zustand'
import { fetchSpotState, fetchOpenOrders, fetchUserFills } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import type { SpotBalance, OpenOrder, Fill } from '@/lib/hyperliquid/types'

interface PortfolioStore {
  balances: SpotBalance[]
  openOrders: OpenOrder[]
  fills: Fill[]
  loading: boolean
  userAddress: string | null
  fetchPortfolio: (address: string) => Promise<void>
  subscribePortfolio: (address: string) => void
  unsubscribePortfolio: () => void
}

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  balances: [],
  openOrders: [],
  fills: [],
  loading: false,
  userAddress: null,

  fetchPortfolio: async (address: string) => {
    set({ loading: true, userAddress: address })
    try {
      const [state, orders, fills] = await Promise.all([
        fetchSpotState(address),
        fetchOpenOrders(address),
        fetchUserFills(address),
      ])

      // Filter to only outcome tokens (start with +)
      const outcomeBalances = state.balances.filter((b) => b.coin.startsWith('+'))
      // Filter to only outcome orders (coins start with #)
      const outcomeOrders = orders.filter((o) => o.coin.startsWith('#'))
      const outcomeFills = fills.filter((f) => f.coin.startsWith('#'))

      set({
        balances: outcomeBalances,
        openOrders: outcomeOrders,
        fills: outcomeFills.slice(0, 50),
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  subscribePortfolio: (address: string) => {
    set({ userAddress: address })

    hlWebSocket.subscribe(
      'orderUpdates',
      { type: 'orderUpdates', user: address },
      (_data) => {
        // Refetch open orders on any update
        fetchOpenOrders(address).then((orders) => {
          set({ openOrders: orders.filter((o) => o.coin.startsWith('#')) })
        })
      }
    )

    hlWebSocket.subscribe(
      'userFills',
      { type: 'userFills', user: address },
      (data) => {
        const newFills = data as Fill[]
        if (Array.isArray(newFills)) {
          const outcomeFills = newFills.filter((f) => f.coin.startsWith('#'))
          set((state) => ({
            fills: [...outcomeFills, ...state.fills].slice(0, 100),
          }))
        }
        // Also refetch balances
        fetchSpotState(address).then((state) => {
          set({ balances: state.balances.filter((b) => b.coin.startsWith('+')) })
        })
      }
    )
  },

  unsubscribePortfolio: () => {
    hlWebSocket.unsubscribe('orderUpdates')
    hlWebSocket.unsubscribe('userFills')
    set({ userAddress: null, balances: [], openOrders: [], fills: [] })
  },
}))
