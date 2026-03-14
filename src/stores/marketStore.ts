import { create } from 'zustand'
import { fetchOutcomeMeta, fetchSpotMeta, fetchSettledOutcome } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { toCoin, toAssetId } from '@/lib/hyperliquid/encoding'
import type { ParsedMarket, AllMids, SpotMeta, Outcome } from '@/lib/hyperliquid/types'

interface SettledMarketInfo {
  market: ParsedMarket
  settleFraction: string
  details: string
}

function parseDescription(desc: string): Record<string, string> {
  const parts: Record<string, string> = {}
  desc.split('|').forEach((part) => {
    const [key, value] = part.split(':')
    if (key && value) parts[key] = value
  })
  return parts
}

function outcomeToParsedMarket(o: Outcome): ParsedMarket {
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
}

/** Derive the quote coin for outcome markets from spotMeta.
 *  Outcome tokens have names starting with 'o' in the token list.
 *  Find any pair with an outcome base token → its quote is the outcome quote. */
function deriveOutcomeQuoteCoin(spotMeta: SpotMeta): string {
  const tokenNameMap = new Map<number, string>()
  for (const t of spotMeta.tokens) {
    tokenNameMap.set(t.index, t.name)
  }

  for (const pair of spotMeta.universe) {
    const baseName = tokenNameMap.get(pair.tokens[0]) ?? ''
    // Outcome tokens are named like 'o1528', 'o1530' etc.
    if (baseName.startsWith('o') && /^o\d+$/.test(baseName)) {
      const quoteName = tokenNameMap.get(pair.tokens[1])
      if (quoteName) return quoteName
    }
  }

  return 'USDC' // fallback if detection fails
}

interface MarketStore {
  markets: ParsedMarket[]
  /** Settled outcomes fetched on-demand, keyed by outcomeId (pre-parsed, stable refs) */
  settledOutcomes: Map<number, SettledMarketInfo>
  mids: AllMids
  spotMeta: SpotMeta | null
  outcomeQuoteCoin: string
  loading: boolean
  error: string | null
  selectedMarketId: number | null
  tradeSide: 'yes' | 'no'
  fetchMarkets: () => Promise<void>
  subscribeMids: () => void
  unsubscribeMids: () => void
  selectMarket: (id: number | null) => void
  setTradeSide: (side: 'yes' | 'no') => void
  getMarket: (id: number) => ParsedMarket | undefined
  getSettledMarket: (outcomeId: number) => SettledMarketInfo | undefined
  fetchSettledMarket: (outcomeId: number) => Promise<void>
  getYesPrice: (market: ParsedMarket) => number
  getNoPrice: (market: ParsedMarket) => number
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  markets: [],
  settledOutcomes: new Map(),
  mids: {},
  spotMeta: null,
  outcomeQuoteCoin: '',
  loading: false,
  error: null,
  selectedMarketId: null,
  tradeSide: 'yes' as const,

  fetchMarkets: async () => {
    const isInitial = get().markets.length === 0
    if (isInitial) set({ loading: true })
    set({ error: null })
    try {
      const [meta, spotMeta] = await Promise.all([
        fetchOutcomeMeta(),
        fetchSpotMeta(),
      ])

      const outcomeQuoteCoin = deriveOutcomeQuoteCoin(spotMeta)

      // Collect outcome IDs that belong to multi-outcome questions
      const multiOutcomeIds = new Set<number>()
      for (const q of meta.questions) {
        if (q.namedOutcomes.length > 1) {
          for (const id of q.namedOutcomes) multiOutcomeIds.add(id)
          multiOutcomeIds.add(q.fallbackOutcome)
        }
      }

      const markets: ParsedMarket[] = meta.outcomes
        .filter((o) => !multiOutcomeIds.has(o.outcome))
        .map(outcomeToParsedMarket)

      set({
        markets,
        spotMeta,
        outcomeQuoteCoin,
        loading: false,
      })
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

  selectMarket: (id) => set({ selectedMarketId: id, tradeSide: 'yes' as const }),

  setTradeSide: (side) => set({ tradeSide: side }),

  getMarket: (id) => get().markets.find((m) => m.outcomeId === id),

  getSettledMarket: (outcomeId) => {
    return get().settledOutcomes.get(outcomeId)
  },

  fetchSettledMarket: async (outcomeId) => {
    // Already cached — skip
    if (get().settledOutcomes.has(outcomeId)) return

    try {
      const settled = await fetchSettledOutcome(outcomeId)
      const info: SettledMarketInfo = {
        market: outcomeToParsedMarket(settled.spec),
        settleFraction: settled.settleFraction,
        details: settled.details,
      }
      const newMap = new Map(get().settledOutcomes)
      newMap.set(outcomeId, info)
      set({ settledOutcomes: newMap })
    } catch {
      // Not a settled outcome or API error — ignore
    }
  },

  getYesPrice: (market) => {
    const mid = get().mids[market.yesCoin]
    return mid ? parseFloat(mid) : 0.5
  },

  getNoPrice: (market) => {
    const mid = get().mids[market.noCoin]
    return mid ? parseFloat(mid) : 0.5
  },
}))
