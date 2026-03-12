import { create } from 'zustand'
import { fetchOutcomeMeta, fetchAllMids } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { toCoin, toAssetId } from '@/lib/hyperliquid/encoding'
import type { ParsedMarket, AllMids } from '@/lib/hyperliquid/types'

function parseDescription(desc: string): Record<string, string> {
  const parts: Record<string, string> = {}
  desc.split('|').forEach((part) => {
    const [key, value] = part.split(':')
    if (key && value) parts[key] = value
  })
  return parts
}

interface MarketStore {
  markets: ParsedMarket[]
  mids: AllMids
  loading: boolean
  error: string | null
  selectedMarketId: number | null
  fetchMarkets: () => Promise<void>
  subscribeMids: () => void
  unsubscribeMids: () => void
  selectMarket: (id: number | null) => void
  getMarket: (id: number) => ParsedMarket | undefined
  getYesPrice: (market: ParsedMarket) => number
  getNoPrice: (market: ParsedMarket) => number
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  markets: [],
  mids: {},
  loading: false,
  error: null,
  selectedMarketId: null,

  fetchMarkets: async () => {
    set({ loading: true, error: null })
    try {
      const [meta, mids] = await Promise.all([fetchOutcomeMeta(), fetchAllMids()])

      const markets: ParsedMarket[] = meta.outcomes.map((o) => {
        const parsed = parseDescription(o.description)
        return {
          outcomeId: o.outcome,
          name: o.name,
          description: o.description,
          class: parsed.class ?? '',
          underlying: parsed.underlying ?? '',
          expiry: parsed.expiry ?? '',
          targetPrice: parsed.targetPrice ? parseFloat(parsed.targetPrice) : 0,
          period: parsed.period ?? '',
          sideNames: [
            o.sideSpecs[0]?.name ?? 'Yes',
            o.sideSpecs[1]?.name ?? 'No',
          ] as [string, string],
          yesCoin: toCoin(o.outcome, 0),
          noCoin: toCoin(o.outcome, 1),
          yesAssetId: toAssetId(o.outcome, 0),
          noAssetId: toAssetId(o.outcome, 1),
        }
      })

      set({ markets, mids, loading: false })
    } catch (err) {
      set({ error: (err as Error).message, loading: false })
    }
  },

  subscribeMids: () => {
    hlWebSocket.subscribe('allMids', { type: 'allMids' }, (data) => {
      const midsData = data as { mids: AllMids }
      if (midsData.mids) {
        set({ mids: midsData.mids })
      }
    })
  },

  unsubscribeMids: () => {
    hlWebSocket.unsubscribe('allMids')
  },

  selectMarket: (id) => set({ selectedMarketId: id }),

  getMarket: (id) => get().markets.find((m) => m.outcomeId === id),

  getYesPrice: (market) => {
    const mid = get().mids[market.yesCoin]
    return mid ? parseFloat(mid) : 0.5
  },

  getNoPrice: (market) => {
    const mid = get().mids[market.noCoin]
    return mid ? parseFloat(mid) : 0.5
  },
}))
