import { create } from 'zustand'
import { fetchSpotState, fetchOpenOrders, fetchUserFills } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { getSwapPairCoin } from '@/lib/hyperliquid/encoding'
import { useMarketStore } from '@/stores/marketStore'
import type { SpotBalance, OpenOrder, Fill } from '@/lib/hyperliquid/types'

/** Parse all spot balances into a coin→amount map */
function toBalanceMap(balances: SpotBalance[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const b of balances) {
    map[b.coin] = parseFloat(b.total)
  }
  return map
}

interface PortfolioStore {
  /** All spot balances keyed by coin name (USDC, USDH, +8890, etc.) */
  spotBalances: Record<string, number>
  /** Outcome token balances only (coins starting with +) */
  balances: SpotBalance[]
  openOrders: OpenOrder[]
  fills: Fill[]
  loading: boolean
  userAddress: string | null
  fetchPortfolio: (address: string) => Promise<void>
  subscribePortfolio: (address: string) => void
  unsubscribePortfolio: () => void
  getBalance: (coin: string) => number
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  spotBalances: {},
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

      const spotBalances = toBalanceMap(state.balances)
      const outcomeBalances = state.balances.filter((b) => b.coin.startsWith('+'))
      const outcomeOrders = orders.filter((o) => o.coin.startsWith('#'))
      const swapCoin = getSwapPairCoin(useMarketStore.getState().spotMeta)
      const relevantFill = (f: Fill) =>
        f.coin.startsWith('#') || (swapCoin && f.coin === swapCoin)
      const outcomeFills = fills.filter(relevantFill)

      set({
        spotBalances,
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
          const swapCoin = getSwapPairCoin(useMarketStore.getState().spotMeta)
          const relevant = newFills.filter(
            (f) => f.coin.startsWith('#') || (swapCoin && f.coin === swapCoin)
          )
          set((state) => ({
            fills: [...relevant, ...state.fills].slice(0, 100),
          }))
        }
        // Refetch all balances
        fetchSpotState(address).then((spotState) => {
          set({
            spotBalances: toBalanceMap(spotState.balances),
            balances: spotState.balances.filter((b) => b.coin.startsWith('+')),
          })
        })
      }
    )
  },

  unsubscribePortfolio: () => {
    hlWebSocket.unsubscribe('orderUpdates')
    hlWebSocket.unsubscribe('userFills')
    set({ userAddress: null, spotBalances: {}, balances: [], openOrders: [], fills: [] })
  },

  getBalance: (coin: string) => get().spotBalances[coin] ?? 0,
}))
