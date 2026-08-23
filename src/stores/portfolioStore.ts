import { create } from 'zustand'
import { fetchUserFillsByTime, fetchClearinghouseState, fetchUserAbstraction } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { getSwapPairCoin } from '@/lib/hyperliquid/encoding'
import { useMarketStore } from '@/stores/marketStore'
import type { SpotBalance, OpenOrder, Fill, AbstractionMode } from '@/lib/hyperliquid/types'

/** Parse spot balances into total + available (total − hold) maps. */
function toBalanceMaps(balances: SpotBalance[]) {
  const total: Record<string, number> = {}
  const available: Record<string, number> = {}
  for (const b of balances) {
    const t = parseFloat(b.total)
    const h = parseFloat(b.hold ?? '0') || 0
    total[b.coin] = t
    available[b.coin] = Math.max(0, t - h)
  }
  return { total, available }
}

/** Swap fills (USDH/USDC spot pair) are only relevant when outcomes settle in
 *  a non-USDC quote — on mainnet (USDC) a user's unrelated USDH trades must not
 *  show up as Verity "Swap" rows. */
function swapCoinForQuote(): string | null {
  const { spotMeta, outcomeQuoteCoin } = useMarketStore.getState()
  if (!outcomeQuoteCoin || outcomeQuoteCoin === 'USDC') return null
  return getSwapPairCoin(spotMeta)
}

function isRelevantFill(f: Fill, swapCoin: string | null): boolean {
  return f.coin.startsWith('#') || (swapCoin !== null && f.coin === swapCoin)
}

function sameOrders(a: OpenOrder[], b: OpenOrder[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].oid !== b[i].oid || a[i].sz !== b[i].sz || a[i].limitPx !== b[i].limitPx) return false
  }
  return true
}

interface PortfolioStore {
  /** All spot balances keyed by coin name (USDC, USDH, +8890, etc.) — TOTAL incl. amounts on hold */
  spotBalances: Record<string, number>
  /** Spot balances net of `hold` (locked by resting orders) — what can actually be traded/withdrawn */
  spotAvailable: Record<string, number>
  /** Outcome token balances only (coins starting with +), non-zero */
  balances: SpotBalance[]
  openOrders: OpenOrder[]
  fills: Fill[]
  loading: boolean
  loadingMore: boolean
  /** False when all available history has been fetched */
  hasMoreFills: boolean
  /** endTime for the next REST history window (oldest ms already scanned − 1);
   *  null = derive from the oldest fill in state. Independent of whether a
   *  window yielded relevant fills, so the cursor always advances. */
  fillsCursor: number | null
  userAddress: string | null

  /** Perps-clearinghouse USDC (where Arbitrum bridge deposits land; what withdraw3 debits) */
  perpsWithdrawable: number
  /** Account abstraction mode — in unified/portfolio-margin modes spot and perps USDC are one balance */
  abstraction: AbstractionMode | null

  subscribePortfolio: (address: string) => void
  unsubscribePortfolio: () => void
  /** Refresh perps balance + abstraction mode (REST; call on open of deposit modal and after transfers) */
  refreshPerpsState: () => Promise<void>
  loadMoreFills: () => Promise<void>
  getBalance: (coin: string) => number
  getAvailable: (coin: string) => number
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  spotBalances: {},
  spotAvailable: {},
  balances: [],
  openOrders: [],
  fills: [],
  loading: false,
  loadingMore: false,
  hasMoreFills: true,
  fillsCursor: null,
  userAddress: null,
  perpsWithdrawable: 0,
  abstraction: null,

  subscribePortfolio: (address: string) => {
    set({ userAddress: address, loading: true, hasMoreFills: true, fillsCursor: null })

    // --- spotState WS: balance snapshots & updates ---
    hlWebSocket.subscribe(
      'spotState',
      { type: 'spotState', user: address, ignorePortfolioMargin: false },
      (data) => {
        const wsData = data as { spotState?: { balances: SpotBalance[] }; balances?: SpotBalance[] }
        const balances = wsData.spotState?.balances ?? wsData.balances
        if (balances) {
          const maps = toBalanceMaps(balances)
          set({
            spotBalances: maps.total,
            spotAvailable: maps.available,
            // HL returns zero-total outcome rows after settlement — drop them
            balances: balances.filter((b) => b.coin.startsWith('+') && parseFloat(b.total) > 0),
            loading: false,
          })
        }
      }
    )

    // --- userFills WS: initial snapshot (isSnapshot: true) + live updates ---
    // aggregateByTime matches the REST pagination below so a crossing order
    // renders as one row in both sections.
    hlWebSocket.subscribe(
      'userFills',
      { type: 'userFills', user: address, aggregateByTime: true },
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

        const swapCoin = swapCoinForQuote()
        const relevant = fills.filter((f) => isRelevantFill(f, swapCoin))

        if (isSnapshot) {
          // Snapshot arrives oldest-first; reverse so newest is first
          const trimmed = relevant.reverse().slice(0, 50)
          set({ fills: trimmed, hasMoreFills: trimmed.length >= 50, fillsCursor: null, loading: false })
        } else if (relevant.length) {
          set((state) => {
            const seen = new Set(state.fills.map((f) => f.tid))
            const fresh = relevant.filter((f) => !seen.has(f.tid))
            if (!fresh.length) return state
            return { fills: [...fresh.reverse(), ...state.fills] }
          })
        }
      }
    )

    // --- openOrders WS: full snapshot on every (re)subscribe + push on change ---
    // (orderUpdates sends no snapshot, so a reconnect would leave the list stale.)
    // dex:'' = default dex, which includes spot and outcome orders.
    hlWebSocket.subscribe(
      'openOrders',
      { type: 'openOrders', user: address, dex: '' },
      (data) => {
        const wsData = data as { orders?: OpenOrder[] }
        if (!wsData?.orders) return
        const next = wsData.orders.filter((o) => o.coin.startsWith('#'))
        set((state) => (sameOrders(state.openOrders, next) ? state : { openOrders: next }))
      }
    )

    get().refreshPerpsState()
  },

  unsubscribePortfolio: () => {
    hlWebSocket.unsubscribe('spotState')
    hlWebSocket.unsubscribe('openOrders')
    hlWebSocket.unsubscribe('userFills')
    set({
      userAddress: null,
      spotBalances: {},
      spotAvailable: {},
      balances: [],
      openOrders: [],
      fills: [],
      hasMoreFills: true,
      fillsCursor: null,
      perpsWithdrawable: 0,
      abstraction: null,
    })
  },

  refreshPerpsState: async () => {
    const { userAddress } = get()
    if (!userAddress) return
    const [perps, abstraction] = await Promise.allSettled([
      fetchClearinghouseState(userAddress),
      fetchUserAbstraction(userAddress),
    ])
    if (get().userAddress !== userAddress) return
    // Never clobber a resolved value with a transient failure
    set((s) => ({
      perpsWithdrawable:
        perps.status === 'fulfilled' ? parseFloat(perps.value?.withdrawable ?? '0') || 0 : s.perpsWithdrawable,
      abstraction: abstraction.status === 'fulfilled' ? abstraction.value : s.abstraction,
    }))
  },

  loadMoreFills: async () => {
    const { userAddress, fills, loadingMore, hasMoreFills, fillsCursor } = get()
    if (!userAddress || loadingMore || !hasMoreFills) return

    set({ loadingMore: true })

    try {
      const oldestFill = fills[fills.length - 1]
      const endTime = fillsCursor ?? (oldestFill ? oldestFill.time - 1 : Date.now())
      const windowStart = endTime - 90 * 24 * 60 * 60 * 1000

      // userFillsByTime returns the OLDEST ≤2000 fills in [startTime, endTime],
      // ascending. Walk forward inside the window until a short page so
      // nothing between the last returned fill and endTime is skipped.
      const rawByTid = new Map<number, Fill>()
      let startTime = windowStart
      let sawAny = false
      for (let guard = 0; guard < 10; guard++) {
        const page = await fetchUserFillsByTime(userAddress, startTime, endTime)
        if (page.length) sawAny = true
        for (const f of page) rawByTid.set(f.tid, f)
        if (page.length < 2000) break
        const last = page[page.length - 1].time
        if (last <= startTime) break // whole page at one timestamp — cannot advance
        startTime = last
      }

      const swapCoin = swapCoinForQuote()
      const relevant = [...rawByTid.values()]
        .filter((f) => isRelevantFill(f, swapCoin))
        .sort((a, b) => b.time - a.time) // newest-first

      const existingTids = new Set(fills.map((f) => f.tid))
      const newFills = relevant.filter((f) => !existingTids.has(f.tid))

      set({
        fills: [...fills, ...newFills],
        // More history may exist beyond this window as long as the window had
        // *any* fills (relevant or not); an entirely empty 90-day window ends it.
        hasMoreFills: sawAny,
        fillsCursor: windowStart - 1, // next window starts strictly below everything scanned
        loadingMore: false,
      })
    } catch {
      set({ loadingMore: false })
    }
  },

  getBalance: (coin: string) => get().spotBalances[coin] ?? 0,
  getAvailable: (coin: string) => get().spotAvailable[coin] ?? 0,
}))
