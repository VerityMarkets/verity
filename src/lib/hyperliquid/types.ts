// --- Outcome Meta ---

export interface SideSpec {
  name: string
}

export interface Outcome {
  outcome: number
  name: string
  description: string
  sideSpecs: SideSpec[]
  /** Quote token symbol — 'USDC' on mainnet, 'USDH' on (legacy) testnet outcomes. */
  quoteToken?: string
  /** Deployer venue tag for permissionless markets; null/absent for protocol ones. */
  venue?: string | null
  /** Deployer's share of the fee scale, e.g. "1.0"; null/absent for protocol ones. */
  deployerFeeScale?: string | null
}

export interface Question {
  question: number
  name: string
  description: string
  fallbackOutcome: number
  namedOutcomes: number[]
  settledNamedOutcomes: number[]
}

export interface OutcomeMeta {
  outcomes: Outcome[]
  questions: Question[]
  /** Non-protocol deployers (permissionless templates; empty on mainnet today). */
  deployers?: unknown[]
  /** Protocol fee scale for outcome markets, e.g. "1.0". */
  feeScale?: string
}

export interface SettledOutcome {
  spec: Outcome
  /** Decimal string in [0,1]: Yes pays settleFraction, No pays 1-settleFraction. */
  settleFraction: string
  /** e.g. "price:79.3301" */
  details: string
  /** Present only for named outcomes of a multi-outcome question. */
  question?: { question: { settled: number }; name: string; description: string }
}

// --- Outcome templates (permissionless / deployer markets) ---

/**
 * What an `outcomeTemplates` entry can be instantiated as:
 *  - `'question'` — a multi-outcome question (its members use `questionOutcome`)
 *  - `standaloneOutcome` — a Yes/No pair with its own side names
 *  - `questionOutcome` — a named outcome of a `parent` question template
 */
export type TemplateRole =
  | 'question'
  | { standaloneOutcome: { sideNames: string[] } }
  | { questionOutcome: { parent: string } }

export interface OutcomeTemplate {
  id: string
  role: TemplateRole
  /** Display-name format string with `{keyword}` placeholders. */
  name: string
  /** Rules prose; may end with a `metadata=category:x|subCategory:y` tail. */
  description: string
  /** `[keyword, type]` pairs, e.g. `["scheduledStart", "dateTime"]`. */
  keywords: [string, string][]
}

// --- Parsed market info ---

/**
 * Shape of a listed market:
 *  - `price`           protocol recurring priceBinary / priceBucket ladders
 *  - `template`        standalone permissionless market from a deployer template
 *  - `question-member` a named outcome (or fallback) of a multi-outcome question
 *  - `freeform`        a hand-written standalone outcome (no template, no kv)
 */
export type MarketKind = 'price' | 'template' | 'question-member' | 'freeform'

export interface ParsedMarket {
  outcomeId: number
  name: string
  description: string
  class: string
  underlying: string
  /** Settlement deadline, `YYYYMMDD-HHMM` UTC; '' when the market has no date. */
  expiry: string
  targetPrice: number
  period: string
  sideNames: [string, string]
  yesCoin: string
  noCoin: string
  yesAssetId: number
  noAssetId: number
  /** Quote token this outcome settles in (from outcomeMeta). */
  quoteToken: string
  /** Set when the outcome belongs to a multi-outcome question (priceBucket etc.). */
  questionId?: number
  /** Bucket index within the question (named outcomes), or -1 for the fallback. */
  bucketIndex?: number
  /** Price thresholds for priceBucket questions. */
  priceThresholds?: number[]
  /** Which parsing branch produced this market — drives grouping and layout. */
  kind: MarketKind
  /** Template id (without the `template:` prefix) when this is a template market. */
  templateId?: string
  /** 'sports' | 'price' | 'economics' … from the template's `metadata=` tail. */
  category?: string
  /** e.g. 'football' — 'N/A' and unresolved placeholders are dropped. */
  subCategory?: string
  /** Event/scheduled start (`YYYYMMDD-HHMM` UTC) when distinct from `expiry`. */
  startsAt?: string
  /** Deployer venue tag; null for protocol markets. */
  venue?: string | null
  /** Deployer's fee scale; null for protocol markets. */
  deployerFeeScale?: string | null
  /** Resolution source named by the template, e.g. 'ESPN'. */
  officialSource?: string
  /** Parsed `k:v|k:v` description (question members: parent's keys + own). */
  kv?: Record<string, string>
  /** Resolved title of the parent question, for question members. */
  questionName?: string
}

// --- Spot Meta ---

export interface SpotToken {
  name: string
  index: number
  szDecimals: number
  weiDecimals: number
  tokenId: string
  isCanonical: boolean
}

export interface SpotPair {
  tokens: [number, number]
  name: string
  index: number
  isCanonical: boolean
}

export interface SpotMeta {
  universe: SpotPair[]
  tokens: SpotToken[]
}

// --- Price Data ---

export type AllMids = Record<string, string>

// --- Order Book ---

export interface L2Level {
  px: string
  sz: string
  n: number
}

export interface L2Book {
  coin: string
  levels: [L2Level[], L2Level[]]
  time: number
  /** Only present when the request carried nSigFigs. */
  spread?: string
}

// --- Trades ---

export interface Trade {
  coin: string
  side: 'B' | 'A'
  px: string
  sz: string
  time: number
  hash: string
  tid: number
  users: [string, string]
}

// --- Candles ---

export interface Candle {
  t: number
  T: number
  s: string
  i: string
  o: string
  c: string
  h: string
  l: string
  v: string
  n: number
}

// --- User State ---

export interface SpotBalance {
  coin: string
  /** Spot token index — absent on outcome ('+') balances. */
  token?: number
  total: string
  /** Amount locked by resting orders; available = total - hold. */
  hold: string
  entryNtl: string
}

export interface SpotClearinghouseState {
  balances: SpotBalance[]
}

/** Perps clearinghouse (subset). Bridge deposits credit this balance. */
export interface ClearinghouseState {
  withdrawable: string
  marginSummary: { accountValue: string; totalMarginUsed: string }
}

export type AbstractionMode =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction'

// --- Orders ---

export interface OpenOrder {
  coin: string
  limitPx: string
  oid: number
  side: 'B' | 'A'
  sz: string
  timestamp: number
  origSz?: string
}

// --- Fills ---

export interface Fill {
  coin: string
  px: string
  sz: string
  side: 'B' | 'A'
  time: number
  startPosition: string
  dir: string
  closedPnl: string
  hash: string
  oid: number
  crossed: boolean
  fee: string
  tid: number
  feeToken: string
  /** Present when a builder fee was charged (already included in `fee`). */
  builderFee?: string
  twapId: number | null
}

// --- Order Action ---

export interface OrderWire {
  a: number
  b: boolean
  p: string
  s: string
  r: boolean
  t: {
    limit: {
      tif: 'Gtc' | 'Ioc' | 'Alo'
    }
  }
}

export interface BuilderFee {
  b: string
  f: number
}

export interface OrderAction {
  type: 'order'
  orders: OrderWire[]
  grouping: 'na'
  builder?: BuilderFee
}

export interface CancelAction {
  type: 'cancel'
  cancels: Array<{ a: number; o: number }>
}

export interface ApproveBuilderFeeAction {
  type: 'approveBuilderFee'
  hyperliquidChain: 'Testnet' | 'Mainnet'
  signatureChainId: string
  maxFeeRate: string
  builder: string
  nonce: number
}

// --- WebSocket ---

export interface WsSubscription {
  type: string
  coin?: string
  user?: string
  interval?: string
  /** For `spotState` — current server param name (the old `isPortfolioMargin` is echoed as this). */
  ignorePortfolioMargin?: boolean
  /** For `l2Book` — server-side aggregation by significant figures (2–5). */
  nSigFigs?: number
  /** For `l2Book` with `nSigFigs` set — finer-grained mantissa adjustment. */
  mantissa?: number
  /** For `userFills` — merge partial fills of one crossing order (matches REST userFillsByTime). */
  aggregateByTime?: boolean
  /** For `openOrders` — perp dex name; '' = default dex (includes spot + outcome orders). */
  dex?: string
}

export interface WsMessage {
  channel: string
  data: unknown
}
