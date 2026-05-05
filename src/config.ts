// Network selection — controlled by VITE_NETWORK env var.
//   .env.development → testnet (local dev default)
//   .env.production  → mainnet (CI build default)
// Override at build time: `VITE_NETWORK=testnet npm run build`
const NETWORK = (import.meta.env.VITE_NETWORK ?? 'mainnet').toLowerCase()
if (NETWORK !== 'testnet' && NETWORK !== 'mainnet') {
  throw new Error(`Invalid VITE_NETWORK: "${NETWORK}". Expected "testnet" or "mainnet".`)
}
export const IS_TESTNET = NETWORK === 'testnet'

// Dev mode: inject a local wallet (no browser extension needed).
// Only enabled on testnet + Vite dev server.
export const DEV_MODE = IS_TESTNET && import.meta.env.DEV

export const API_URL = IS_TESTNET
  ? 'https://api.hyperliquid-testnet.xyz'
  : 'https://api.hyperliquid.xyz'

export const WS_URL = IS_TESTNET
  ? 'wss://api.hyperliquid-testnet.xyz/ws'
  : 'wss://api.hyperliquid.xyz/ws'

export const SIGNING_SOURCE = IS_TESTNET ? 'b' : 'a'

// Builder fee address — DO NOT modify (see LICENSE, clause 2)
export const BUILDER_ADDRESS = '0x52aFeA1eb3992e1d27600B922fB30d27548fc7de' as const

// Builder fee in tenths of basis points (1 = 0.1bp = 0.001%, beta rate).
// Range: 0–1000 (0%–1%). Mainnet beta: 1. Post-beta target: 100 (0.1%).
export const BUILDER_FEE = 1

export const NOSTR_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export const EIP712_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const
