// --- Outcome Meta ---

export interface SideSpec {
  name: string
}

export interface Outcome {
  outcome: number
  name: string
  description: string
  sideSpecs: SideSpec[]
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
}

// --- Parsed market info ---

export interface ParsedMarket {
  outcomeId: number
  name: string
  description: string
  class: string
  underlying: string
  expiry: string
  targetPrice: number
  period: string
  sideNames: [string, string]
  yesCoin: string
  noCoin: string
  yesAssetId: number
  noAssetId: number
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
  total: string
  hold: string
  entryNtl: string
}

export interface SpotClearinghouseState {
  balances: SpotBalance[]
}

// --- Orders ---

export interface OpenOrder {
  coin: string
  limitPx: string
  oid: number
  side: 'B' | 'A'
  sz: string
  timestamp: number
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
  isPortfolioMargin?: boolean
}

export interface WsMessage {
  channel: string
  data: unknown
}
