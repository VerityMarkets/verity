import { create } from 'zustand'
import {
  fetchOutcomeMeta,
  fetchOutcomeTemplates,
  fetchSpotMeta,
  fetchSettledOutcome,
} from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { outcomeToParsedMarket } from '@/lib/parseMarket'
import { indexTemplates, type TemplateMap } from '@/lib/templates'
import { parseExpiry } from '@/lib/marketFormat'
import type {
  ParsedMarket,
  AllMids,
  SpotMeta,
  OutcomeTemplate,
  Question,
} from '@/lib/hyperliquid/types'

interface SettledMarketInfo {
  market: ParsedMarket
  settleFraction: string
  details: string
}

/**
 * How long after its deadline a market stays listed. HL settles a few minutes
 * to a couple of hours late; dropping it the instant the clock hits zero makes
 * live positions vanish from the UI mid-settlement.
 */
const SETTLEMENT_GRACE_MS = 2 * 60 * 60 * 1000

/** `true` once the market's deadline is more than the grace period in the past. */
function isStale(m: ParsedMarket, now: number): boolean {
  if (!m.expiry) return false
  const d = parseExpiry(m.expiry)
  return !!d && d.getTime() < now - SETTLEMENT_GRACE_MS
}

// The template catalogue is static per network; fetch it once per session and
// keep one Map built from it (rebuilt only when the array identity changes).
let templatesOnce: Promise<OutcomeTemplate[]> | null = null
let templateIndexCache: { list: OutcomeTemplate[]; map: TemplateMap } | null = null

function templateIndex(list: OutcomeTemplate[]): TemplateMap {
  if (!templateIndexCache || templateIndexCache.list !== list) {
    templateIndexCache = { list, map: indexTemplates(list) }
  }
  return templateIndexCache.map
}

interface MarketStore {
  /** Tradable markets shown in lists: standalone outcomes + named question
   *  outcomes (each is a Yes/No token pair). Question fallbacks are excluded,
   *  as are markets past their deadline by more than the settlement grace. */
  markets: ParsedMarket[]
  /** Past-deadline markets HL has not settled yet — for an "awaiting
   *  settlement" view. Excluded from `markets`, still in `allOutcomes`. */
  staleMarkets: ParsedMarket[]
  /** Every outcome from outcomeMeta (incl. question fallbacks), keyed by id —
   *  used to resolve balances/orders/fills that reference any outcome. */
  allOutcomes: Map<number, ParsedMarket>
  /** Settled outcomes fetched on-demand, keyed by outcomeId (pre-parsed, stable refs) */
  settledOutcomes: Map<number, SettledMarketInfo>
  mids: AllMids
  spotMeta: SpotMeta | null
  /** Permissionless template catalogue; `[]` on mainnet / when unavailable. */
  templates: OutcomeTemplate[]
  outcomeQuoteCoin: string
  loading: boolean
  error: string | null
  selectedMarketId: number | null
  tradeSide: 'yes' | 'no'
  fetchMarkets: () => Promise<void>
  subscribeMids: () => void
  unsubscribeMids: () => void
  /** Live market lifecycle (created/settled) via the outcomeMetaUpdates WS channel. */
  subscribeMetaUpdates: () => void
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
  staleMarkets: [],
  allOutcomes: new Map(),
  settledOutcomes: new Map(),
  mids: {},
  spotMeta: null,
  templates: [],
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
      // spotMeta is static for our purposes (USDH/USDC swap pair lookup) and
      // costs the same rate-limit weight as outcomeMeta — fetch it once.
      // Same for the permissionless template catalogue.
      const [meta, spotMeta, templates] = await Promise.all([
        fetchOutcomeMeta(),
        get().spotMeta ?? fetchSpotMeta(),
        (templatesOnce ??= fetchOutcomeTemplates()),
      ])
      const templateMap = templateIndex(templates)

      // Map every outcome that belongs to a question → its question
      const questionOf = new Map<number, Question>()
      for (const q of meta.questions) {
        for (const id of q.namedOutcomes) questionOf.set(id, q)
        questionOf.set(q.fallbackOutcome, q)
      }

      const allOutcomes = new Map<number, ParsedMarket>()
      for (const o of meta.outcomes) {
        allOutcomes.set(o.outcome, outcomeToParsedMarket(o, questionOf.get(o.outcome), templateMap))
      }
      // Listed markets: everything except question fallbacks ("none of the
      // above" — no book, 0.5 placeholder mid; kept in allOutcomes only) and
      // markets whose deadline passed longer ago than the settlement grace.
      const now = Date.now()
      const listable = [...allOutcomes.values()].filter((m) => m.bucketIndex !== -1)
      const markets: ParsedMarket[] = []
      const staleMarkets: ParsedMarket[] = []
      for (const m of listable) (isStale(m, now) ? staleMarkets : markets).push(m)

      // Quote token is per-outcome (USDC on mainnet, USDH on legacy testnet).
      // Expose the dominant one for global balance widgets.
      const counts = new Map<string, number>()
      for (const m of markets) counts.set(m.quoteToken, (counts.get(m.quoteToken) ?? 0) + 1)
      let outcomeQuoteCoin = get().outcomeQuoteCoin || 'USDC'
      let best = -1
      for (const [coin, n] of counts) if (n > best) { best = n; outcomeQuoteCoin = coin }

      // Release book/trade subscriptions for outcomes that just disappeared
      // (settled). HL closes the whole socket if we keep subscribing to them.
      const prev = get().allOutcomes
      const gone: ParsedMarket[] = []
      for (const [id, m] of prev) if (!allOutcomes.has(id)) gone.push(m)
      if (gone.length) {
        const { useOrderBookStore } = await import('@/stores/orderbookStore')
        const { useTradeStore } = await import('@/stores/tradeStore')
        for (const m of gone) {
          useOrderBookStore.getState().unsubscribeBook(m.yesCoin)
          useOrderBookStore.getState().unsubscribeBook(m.noCoin)
          const t = useTradeStore.getState()
          if (t.coin === m.yesCoin || t.coin === m.noCoin) t.unsubscribeTrades()
        }
      }

      set({
        markets,
        staleMarkets,
        allOutcomes,
        spotMeta,
        templates,
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

  subscribeMetaUpdates: () => {
    // HL pushes outcomeCreated / outcomeSettled / questionUpdated /
    // questionSettled in bursts around the 06:00 UTC rollover; a trailing
    // debounce coalesces them into a single cheap refetch.
    let timer: ReturnType<typeof setTimeout> | null = null
    hlWebSocket.subscribe('outcomeMetaUpdates', { type: 'outcomeMetaUpdates' }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        get().fetchMarkets()
      }, 750)
    })
  },

  selectMarket: (id) => set({ selectedMarketId: id, tradeSide: 'yes' as const }),

  setTradeSide: (side) => set({ tradeSide: side }),

  getMarket: (id) => get().allOutcomes.get(id),

  getSettledMarket: (outcomeId) => {
    return get().settledOutcomes.get(outcomeId)
  },

  fetchSettledMarket: async (outcomeId) => {
    // Already cached — skip
    if (get().settledOutcomes.has(outcomeId)) return

    try {
      const settled = await fetchSettledOutcome(outcomeId)
      if (!settled) return // not settled (yet) — HL returns null
      // Named outcomes of a question carry the question's description on
      // `settled.question`; synthesize a minimal Question so parsing matches.
      const isFallback = settled.spec.description === 'other'
      const q: Question | undefined = settled.question
        ? {
            question: settled.question.question.settled,
            name: settled.question.name,
            description: settled.question.description,
            fallbackOutcome: isFallback ? outcomeId : -1,
            namedOutcomes: isFallback ? [] : [outcomeId],
            settledNamedOutcomes: [],
          }
        : undefined
      const info: SettledMarketInfo = {
        market: outcomeToParsedMarket(settled.spec, q, templateIndex(get().templates)),
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
