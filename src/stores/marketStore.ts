import { create } from 'zustand'
import { fetchOutcomeMeta, fetchAllMids, fetchSpotMeta } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { toCoin, toAssetId } from '@/lib/hyperliquid/encoding'
import type { ParsedMarket, AllMids, SpotMeta, Outcome, Question } from '@/lib/hyperliquid/types'

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
  allOutcomes: Outcome[]
  questions: Question[]
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
  getMarketOrExpired: (id: number) => ParsedMarket | undefined
  isSettled: (outcomeId: number) => boolean
  getSettlementResult: (outcomeId: number) => 'yes' | 'no' | null
  getYesPrice: (market: ParsedMarket) => number
  getNoPrice: (market: ParsedMarket) => number
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  markets: [],
  allOutcomes: [],
  questions: [],
  mids: {},
  spotMeta: null,
  outcomeQuoteCoin: '',
  loading: false,
  error: null,
  selectedMarketId: null,
  tradeSide: 'yes' as const,

  fetchMarkets: async () => {
    set({ loading: true, error: null })
    try {
      const [meta, mids, spotMeta] = await Promise.all([
        fetchOutcomeMeta(),
        fetchAllMids(),
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
        allOutcomes: meta.outcomes,
        questions: meta.questions,
        mids,
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

  getMarketOrExpired: (id) => {
    // Check active markets first
    const active = get().markets.find((m) => m.outcomeId === id)
    if (active) return active

    // Fall back to all outcomes (includes expired/settled)
    const outcome = get().allOutcomes.find((o) => o.outcome === id)
    if (!outcome) return undefined

    return outcomeToParsedMarket(outcome)
  },

  isSettled: (outcomeId) => {
    const { questions } = get()
    for (const q of questions) {
      // Check if this outcome belongs to any question that has settled outcomes
      if (
        q.namedOutcomes.includes(outcomeId) ||
        q.fallbackOutcome === outcomeId
      ) {
        return q.settledNamedOutcomes.length > 0
      }
    }
    return false
  },

  getSettlementResult: (outcomeId) => {
    const { questions } = get()
    for (const q of questions) {
      if (
        q.namedOutcomes.includes(outcomeId) ||
        q.fallbackOutcome === outcomeId
      ) {
        if (q.settledNamedOutcomes.length === 0) return null
        // If this outcome is in the settled list, it resolved Yes
        if (q.settledNamedOutcomes.includes(outcomeId)) return 'yes'
        // Otherwise it resolved No
        return 'no'
      }
    }
    return null
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
