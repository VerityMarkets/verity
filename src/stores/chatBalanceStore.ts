import { create } from 'zustand'
import { fetchSpotState } from '@/lib/hyperliquid/api'

const CACHE_TTL = 60_000 // 60 seconds
const BATCH_SIZE = 10 // max concurrent fetches

interface CachedBalance {
  balances: Record<string, number> // coin → amount
  fetchedAt: number
}

interface ChatBalanceStore {
  /** Cached spot balances per evm address */
  cache: Map<string, CachedBalance>
  /** Addresses currently being fetched */
  fetching: Set<string>
  /** Get a specific token balance for a user, returns 0 if unknown */
  getBalance: (evmAddress: string, coin: string) => number
  /** Batch-fetch balances for a list of evm addresses (deduped, cached) */
  fetchBalances: (addresses: string[]) => Promise<void>
}

export const useChatBalanceStore = create<ChatBalanceStore>((set, get) => ({
  cache: new Map(),
  fetching: new Set(),

  getBalance: (evmAddress: string, coin: string) => {
    const entry = get().cache.get(evmAddress.toLowerCase())
    if (!entry) return 0
    return entry.balances[coin] ?? 0
  },

  fetchBalances: async (addresses: string[]) => {
    const now = Date.now()
    const { cache, fetching } = get()

    // Deduplicate, lowercase, skip cached/in-flight
    const needed = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(
      (addr) => {
        if (fetching.has(addr)) return false
        const cached = cache.get(addr)
        if (cached && now - cached.fetchedAt < CACHE_TTL) return false
        return true
      }
    )

    if (needed.length === 0) return

    // Mark as fetching
    set((s) => {
      const fetching = new Set(s.fetching)
      for (const addr of needed) fetching.add(addr)
      return { fetching }
    })

    // Batch in groups
    for (let i = 0; i < needed.length; i += BATCH_SIZE) {
      const batch = needed.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map((addr) => fetchSpotState(addr).then((state) => ({ addr, state })))
      )

      set((s) => {
        const cache = new Map(s.cache)
        const fetching = new Set(s.fetching)

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { addr, state } = result.value
            const balances: Record<string, number> = {}
            for (const b of state.balances) {
              balances[b.coin] = parseFloat(b.total)
            }
            cache.set(addr, { balances, fetchedAt: Date.now() })
            fetching.delete(addr)
          } else {
            // On failure, remove from fetching so it retries next cycle
            // (we don't know which one failed in allSettled, handled above per-item)
          }
        }

        // Clean up fetching for any that weren't in results (edge case)
        for (const addr of batch) fetching.delete(addr)

        return { cache, fetching }
      })
    }
  },
}))
