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

// Builder fee address - replace with your actual builder address
export const BUILDER_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// Builder fee in tenths of basis points (10 = 1bp = 0.01%)
export const BUILDER_FEE = 10

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
