import { encode } from '@msgpack/msgpack'
import { keccak256 } from 'viem'
import { SIGNING_SOURCE, EIP712_DOMAIN, IS_TESTNET } from '@/config'
import type { OrderWire, BuilderFee } from './types'

// --- Float conversion ---

export function floatToWire(x: number): string {
  const rounded = parseFloat(x.toFixed(8))
  if (Math.abs(rounded - x) > 1e-12) {
    throw new Error(`Float rounding error too large: ${x}`)
  }
  return rounded.toString()
}

// --- Action hash ---

function actionHash(
  action: unknown,
  nonce: number,
  vaultAddress?: string
): `0x${string}` {
  const msgpackBytes = encode(action)
  const nonceBytes = new Uint8Array(8)
  const view = new DataView(nonceBytes.buffer)
  view.setBigUint64(0, BigInt(nonce), false) // big-endian

  let data: Uint8Array
  if (vaultAddress) {
    const addrBytes = hexToBytes(vaultAddress)
    data = new Uint8Array(msgpackBytes.length + 8 + 1 + 20)
    data.set(msgpackBytes, 0)
    data.set(nonceBytes, msgpackBytes.length)
    data[msgpackBytes.length + 8] = 0x01
    data.set(addrBytes, msgpackBytes.length + 9)
  } else {
    data = new Uint8Array(msgpackBytes.length + 8 + 1)
    data.set(msgpackBytes, 0)
    data.set(nonceBytes, msgpackBytes.length)
    data[msgpackBytes.length + 8] = 0x00
  }

  return keccak256(data)
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  }
  return bytes
}

// --- EIP-712 Signing ---

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const

export async function signL1Action(
  walletClient: {
    signTypedData: (args: {
      domain: typeof EIP712_DOMAIN
      types: typeof AGENT_TYPES
      primaryType: 'Agent'
      message: { source: string; connectionId: `0x${string}` }
    }) => Promise<`0x${string}`>
  },
  action: unknown,
  nonce: number,
  vaultAddress?: string
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number }> {
  const hash = actionHash(action, nonce, vaultAddress)

  const signature = await walletClient.signTypedData({
    domain: EIP712_DOMAIN,
    types: AGENT_TYPES,
    primaryType: 'Agent',
    message: {
      source: SIGNING_SOURCE,
      connectionId: hash,
    },
  })

  return splitSignature(signature)
}

// --- User-signed actions (approveBuilderFee) ---

const APPROVE_BUILDER_FEE_TYPES = {
  'HyperliquidTransaction:ApproveBuilderFee': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'maxFeeRate', type: 'string' },
    { name: 'builder', type: 'address' },
    { name: 'nonce', type: 'uint64' },
  ],
} as const

const USER_SIGNED_DOMAIN = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  chainId: 421614, // 0x66eee
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const

export async function signApproveBuilderFee(
  walletClient: {
    signTypedData: (args: {
      domain: typeof USER_SIGNED_DOMAIN
      types: typeof APPROVE_BUILDER_FEE_TYPES
      primaryType: 'HyperliquidTransaction:ApproveBuilderFee'
      message: {
        hyperliquidChain: string
        maxFeeRate: string
        builder: `0x${string}`
        nonce: bigint
      }
    }) => Promise<`0x${string}`>
  },
  builder: `0x${string}`,
  maxFeeRate: string,
  nonce: number
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number }> {
  const signature = await walletClient.signTypedData({
    domain: USER_SIGNED_DOMAIN,
    types: APPROVE_BUILDER_FEE_TYPES,
    primaryType: 'HyperliquidTransaction:ApproveBuilderFee',
    message: {
      hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
      maxFeeRate,
      builder,
      nonce: BigInt(nonce),
    },
  })

  return splitSignature(signature)
}

// --- Approve Agent signing (user-signed action) ---

const APPROVE_AGENT_TYPES = {
  'HyperliquidTransaction:ApproveAgent': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'agentAddress', type: 'address' },
    { name: 'agentName', type: 'string' },
    { name: 'nonce', type: 'uint64' },
  ],
} as const

export async function signApproveAgent(
  walletClient: {
    signTypedData: (args: {
      domain: typeof USER_SIGNED_DOMAIN
      types: typeof APPROVE_AGENT_TYPES
      primaryType: 'HyperliquidTransaction:ApproveAgent'
      message: {
        hyperliquidChain: string
        agentAddress: `0x${string}`
        agentName: string
        nonce: bigint
      }
    }) => Promise<`0x${string}`>
  },
  agentAddress: `0x${string}`,
  agentName: string,
  nonce: number
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number }> {
  const signature = await walletClient.signTypedData({
    domain: USER_SIGNED_DOMAIN,
    types: APPROVE_AGENT_TYPES,
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    message: {
      hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
      agentAddress,
      agentName,
      nonce: BigInt(nonce),
    },
  })

  return splitSignature(signature)
}

// --- Withdraw signing (user-signed action) ---

const WITHDRAW_TYPES = {
  'HyperliquidTransaction:Withdraw': [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' },
  ],
} as const

/** Sign a withdraw3 action to bridge USDC back to Arbitrum. */
export async function signWithdraw3(
  walletClient: {
    signTypedData: (args: {
      domain: typeof USER_SIGNED_DOMAIN
      types: typeof WITHDRAW_TYPES
      primaryType: 'HyperliquidTransaction:Withdraw'
      message: {
        hyperliquidChain: string
        destination: string
        amount: string
        time: bigint
      }
    }) => Promise<`0x${string}`>
  },
  destination: string,
  amount: string,
  nonce: number
): Promise<{ r: `0x${string}`; s: `0x${string}`; v: number }> {
  const signature = await walletClient.signTypedData({
    domain: USER_SIGNED_DOMAIN,
    types: WITHDRAW_TYPES,
    primaryType: 'HyperliquidTransaction:Withdraw',
    message: {
      hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
      destination,
      amount,
      time: BigInt(nonce),
    },
  })

  return splitSignature(signature)
}

// --- Helpers ---

function splitSignature(sig: `0x${string}`): {
  r: `0x${string}`
  s: `0x${string}`
  v: number
} {
  const bytes = hexToBytes(sig)
  const r = `0x${Array.from(bytes.slice(0, 32))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`
  const s = `0x${Array.from(bytes.slice(32, 64))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as `0x${string}`
  const v = bytes[64]
  return { r, s, v }
}

// --- Order construction ---

export function orderToWire(
  assetId: number,
  isBuy: boolean,
  price: number,
  size: number,
  reduceOnly: boolean = false,
  tif: 'Gtc' | 'Ioc' | 'Alo' = 'Gtc'
): OrderWire {
  return {
    a: assetId,
    b: isBuy,
    p: floatToWire(price),
    s: floatToWire(size),
    r: reduceOnly,
    t: { limit: { tif } },
  }
}

export function buildOrderAction(
  orders: OrderWire[],
  builder?: BuilderFee
): {
  type: 'order'
  orders: OrderWire[]
  grouping: 'na'
  builder?: BuilderFee
} {
  const action: {
    type: 'order'
    orders: OrderWire[]
    grouping: 'na'
    builder?: BuilderFee
  } = {
    type: 'order',
    orders,
    grouping: 'na',
  }
  if (builder) {
    action.builder = builder
  }
  return action
}
