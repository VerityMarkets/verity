import { create } from 'zustand'
import { fetchOutcomeMeta, fetchSpotMeta, fetchSettledOutcome } from '@/lib/hyperliquid/api'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { toCoin, toAssetId } from '@/lib/hyperliquid/encoding'
import type { ParsedMarket, AllMids, SpotMeta, Outcome, Question } from '@/lib/hyperliquid/types'

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

const fmtUsd = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 })

/** Human label for bucket `index` of a priceBucket question. */
function bucketLabel(underlying: string, thresholds: number[], index: number): string {
  if (index <= 0) return `${underlying} below ${fmtUsd(thresholds[0])}`
  if (index >= thresholds.length) return `${underlying} above ${fmtUsd(thresholds[thresholds.length - 1])}`
  return `${underlying} between ${fmtUsd(thresholds[index - 1])} and ${fmtUsd(thresholds[index])}`
}

/**
 * Parse an outcome into a ParsedMarket.
 *
 * Standalone outcomes carry their own description
 *   "class:priceBinary|underlying:BTC|expiry:20260823-0600|targetPrice:77431|period:1d".
 * Named outcomes of a multi-outcome *question* only carry "index:N" — the
 * class/underlying/expiry/thresholds live on the question's description
 *   "class:priceBucket|underlying:BTC|expiry:...|priceThresholds:75882,78979|period:1d".
 * The question's fallback outcome has description "other".
 */
function outcomeToParsedMarket(o: Outcome, q?: Question): ParsedMarket {
  const own = parseDescription(o.description)
  const parsed = q ? parseDescription(q.description) : own
  const thresholds = parsed.priceThresholds
    ? parsed.priceThresholds.split(',').map((t) => parseFloat(t)).filter((n) => Number.isFinite(n))
    : undefined
  const underlying = parsed.underlying ?? ''

  let name = o.name
  let bucketIndex: number | undefined
  if (q) {
    const isFallback = q.fallbackOutcome === o.outcome
    bucketIndex = isFallback ? -1 : parseInt(own.index ?? '', 10)
    if (isFallback) name = `${q.name}: none of the above`
    else if (thresholds && thresholds.length && underlying && Number.isFinite(bucketIndex)) {
      name = bucketLabel(underlying, thresholds, bucketIndex)
    } else name = `${q.name} #${Number.isFinite(bucketIndex) ? bucketIndex : '?'}`
  }

  return {
    outcomeId: o.outcome,
    name,
    description: q ? q.description : o.description,
    class: parsed.class ?? '',
    underlying,
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
    quoteToken: o.quoteToken ?? 'USDC',
    questionId: q?.question,
    bucketIndex,
    priceThresholds: thresholds,
  }
}

interface MarketStore {
  /** Tradable markets shown in lists: standalone outcomes + named question
   *  outcomes (each is a Yes/No token pair). Question fallbacks are excluded. */
  markets: ParsedMarket[]
  /** Every outcome from outcomeMeta (incl. question fallbacks), keyed by id —
   *  used to resolve balances/orders/fills that reference any outcome. */
  allOutcomes: Map<number, ParsedMarket>
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
  allOutcomes: new Map(),
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
      // spotMeta is static for our purposes (USDH/USDC swap pair lookup) and
      // costs the same rate-limit weight as outcomeMeta — fetch it once.
      const [meta, spotMeta] = await Promise.all([
        fetchOutcomeMeta(),
        get().spotMeta ?? fetchSpotMeta(),
      ])

      // Map every outcome that belongs to a question → its question
      const questionOf = new Map<number, Question>()
      for (const q of meta.questions) {
        for (const id of q.namedOutcomes) questionOf.set(id, q)
        questionOf.set(q.fallbackOutcome, q)
      }

      const allOutcomes = new Map<number, ParsedMarket>()
      for (const o of meta.outcomes) {
        allOutcomes.set(o.outcome, outcomeToParsedMarket(o, questionOf.get(o.outcome)))
      }
      // Listed markets: everything except question fallbacks ("none of the
      // above" — no book, 0.5 placeholder mid; kept in allOutcomes only).
      const markets = [...allOutcomes.values()].filter((m) => m.bucketIndex !== -1)

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
        allOutcomes,
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
        market: outcomeToParsedMarket(settled.spec, q),
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
