export const IS_TESTNET = true

// Dev mode: inject a local wallet (no browser extension needed)
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

// Builder fee in tenths of basis points (100 = 10bp = 0.1%)
export const BUILDER_FEE = 100

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
