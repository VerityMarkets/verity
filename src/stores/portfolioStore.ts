import { create } from 'zustand'
import { fetchOpenOrders } from '@/lib/hyperliquid/api'
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

  subscribePortfolio: (address: string) => {
    set({ userAddress: address, loading: true })

    const swapCoin = getSwapPairCoin(useMarketStore.getState().spotMeta)
    const isRelevantFill = (f: Fill) =>
      f.coin.startsWith('#') || (swapCoin && f.coin === swapCoin)

    // --- spotState WS: balance snapshots & updates ---
    hlWebSocket.subscribe(
      'spotState',
      { type: 'spotState', user: address, isPortfolioMargin: false },
      (data) => {
        const wsData = data as { spotState?: { balances: SpotBalance[] }; balances?: SpotBalance[] }
        const balances = wsData.spotState?.balances ?? wsData.balances
        if (balances) {
          set({
            spotBalances: toBalanceMap(balances),
            balances: balances.filter((b) => b.coin.startsWith('+')),
            loading: false,
          })
        }
      }
    )

    // --- userFills WS: initial snapshot (isSnapshot: true) + live updates ---
    hlWebSocket.subscribe(
      'userFills',
      { type: 'userFills', user: address },
      (data) => {
        const wsData = data as { isSnapshot?: boolean; fills?: Fill[] } | Fill[]
        let fills: Fill[]
        let isSnapshot = false

        if (Array.isArray(wsData)) {
          fills = wsData
        } else {
          fills = wsData.fills ?? []
          isSnapshot = wsData.isSnapshot ?? false
        }

        const relevant = fills.filter(isRelevantFill)

        if (isSnapshot) {
          // Snapshot arrives oldest-first; reverse so newest is first
          set({ fills: relevant.reverse().slice(0, 100), loading: false })
        } else {
          set((state) => ({
            fills: [...relevant, ...state.fills].slice(0, 100),
          }))
        }
      }
    )

    // --- orderUpdates WS: triggers refetch of open orders ---
    hlWebSocket.subscribe(
      'orderUpdates',
      { type: 'orderUpdates', user: address },
      () => {
        fetchOpenOrders(address).then((orders) => {
          set({ openOrders: orders.filter((o) => o.coin.startsWith('#')) })
        })
      }
    )

    // Initial open orders fetch (orderUpdates doesn't send a snapshot)
    fetchOpenOrders(address).then((orders) => {
      set({ openOrders: orders.filter((o) => o.coin.startsWith('#')) })
    })
  },

  unsubscribePortfolio: () => {
    hlWebSocket.unsubscribe('spotState')
    hlWebSocket.unsubscribe('orderUpdates')
    hlWebSocket.unsubscribe('userFills')
    set({ userAddress: null, spotBalances: {}, balances: [], openOrders: [], fills: [] })
  },

  getBalance: (coin: string) => get().spotBalances[coin] ?? 0,
}))
