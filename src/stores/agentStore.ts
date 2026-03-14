import { create } from 'zustand'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { signApproveAgent, signApproveBuilderFee, signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange, fetchMaxBuilderFee, fetchExtraAgents } from '@/lib/hyperliquid/api'
import { BUILDER_ADDRESS, BUILDER_FEE, IS_TESTNET } from '@/config'

// ---------------------------------------------------------------------------
// localStorage keys (scoped per network + wallet address)
// ---------------------------------------------------------------------------

function storageKey(address: string): string {
  const net = IS_TESTNET ? 'testnet' : 'mainnet'
  return `verity:agent:${net}:${address.toLowerCase()}`
}

const HAS_REAL_BUILDER =
  BUILDER_ADDRESS !== '0x0000000000000000000000000000000000000000'

interface StoredAgent {
  privateKey: Hex
  address: Hex
  name: string
}

// ---------------------------------------------------------------------------
// Agent signer — lightweight object matching signL1Action's walletClient shape
// ---------------------------------------------------------------------------

function createAgentSigner(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  return {
    address: account.address,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signTypedData: (args: any) => account.signTypedData(args),
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AgentStore {
  agentKey: Hex | null
  agentAddress: Hex | null
  parentAddress: string | null
  enabling: boolean
  error: string | null
  /** Whether the builder fee has been approved for this wallet */
  builderFeeApproved: boolean

  load: (walletAddress: string) => void
  /** Validate agent + builder fee against on-chain state; clears agent if invalid */
  revalidate: () => Promise<void>
  clear: () => void
  getAgentSigner: (forAddress?: string) => ReturnType<typeof createAgentSigner> | null
  enableTrading: (
    walletClient: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signTypedData: (args: any) => Promise<Hex>
    },
    walletAddress: string
  ) => Promise<void>
  /** Approve builder fee only (agent already exists) */
  approveBuilderFee: (
    walletClient: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signTypedData: (args: any) => Promise<Hex>
    },
    walletAddress: string
  ) => Promise<void>
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agentKey: null,
  agentAddress: null,
  parentAddress: null,
  enabling: false,
  error: null,
  builderFeeApproved: false,

  load: (walletAddress: string) => {
    const { agentKey: currentKey, parentAddress } = get()
    if (currentKey && parentAddress?.toLowerCase() === walletAddress.toLowerCase()) {
      return
    }

    const key = storageKey(walletAddress)
    let stored: StoredAgent | null = null
    try {
      const raw = localStorage.getItem(key)
      if (raw) stored = JSON.parse(raw)
    } catch {
      localStorage.removeItem(key)
    }

    if (stored) {
      set({
        agentKey: stored.privateKey,
        agentAddress: stored.address,
        parentAddress: walletAddress,
        error: null,
      })
    } else {
      set({
        agentKey: null,
        agentAddress: null,
        parentAddress: walletAddress,
        error: null,
      })
    }
  },

  revalidate: async () => {
    const { agentAddress, parentAddress } = get()
    if (!parentAddress) return

    // Check agent validity
    if (agentAddress) {
      try {
        const agents = await fetchExtraAgents(parentAddress)
        const addr = agentAddress.toLowerCase()
        const valid = agents.some(
          (a) => a.address.toLowerCase() === addr && a.validUntil > Date.now()
        )
        if (!valid) {
          localStorage.removeItem(storageKey(parentAddress))
          set({ agentKey: null, agentAddress: null, error: null })
        }
      } catch {
        // Network error — keep stored agent
      }
    }

    // Check builder fee approval
    if (HAS_REAL_BUILDER) {
      try {
        const maxFee = await fetchMaxBuilderFee(parentAddress, BUILDER_ADDRESS)
        set({ builderFeeApproved: maxFee >= BUILDER_FEE })
      } catch {
        // Network error — assume not approved to be safe
      }
    }
  },

  clear: () => {
    set({
      agentKey: null,
      agentAddress: null,
      parentAddress: null,
      error: null,
      builderFeeApproved: false,
    })
  },

  getAgentSigner: (forAddress?: string) => {
    const { agentKey, parentAddress } = get()
    if (!agentKey) return null
    if (forAddress && parentAddress && forAddress.toLowerCase() !== parentAddress.toLowerCase()) {
      return null
    }
    return createAgentSigner(agentKey)
  },

  enableTrading: async (walletClient, walletAddress) => {
    set({ enabling: true, error: null })

    try {
      // 1. Generate agent keypair
      const agentPrivKey = generatePrivateKey()
      const agentAccount = privateKeyToAccount(agentPrivKey)
      const agentAddr = agentAccount.address

      // 2. Approve agent on-chain
      const agentNonce = Date.now()
      const agentName = 'Verity Webapp'
      const agentSig = await signApproveAgent(
        walletClient,
        agentAddr,
        agentName,
        agentNonce
      )

      await postExchange({
        action: {
          type: 'approveAgent',
          hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
          signatureChainId: '0x66eee',
          agentAddress: agentAddr,
          agentName,
          nonce: agentNonce,
        },
        nonce: agentNonce,
        signature: agentSig,
      })

      // 3. Approve builder fee (non-fatal)
      try {
        await get().approveBuilderFee(walletClient, walletAddress)
      } catch {
        // Non-fatal — orders can still work without builder fee
      }

      // 4. Persist to localStorage
      const stored: StoredAgent = {
        privateKey: agentPrivKey,
        address: agentAddr,
        name: agentName,
      }
      localStorage.setItem(storageKey(walletAddress), JSON.stringify(stored))

      set({
        agentKey: agentPrivKey,
        agentAddress: agentAddr,
        parentAddress: walletAddress,
        enabling: false,
        error: null,
      })
    } catch (err) {
      set({
        enabling: false,
        error: (err as Error).message,
      })
      throw err
    }
  },

  approveBuilderFee: async (walletClient, walletAddress) => {
    if (!HAS_REAL_BUILDER) return
    set({ enabling: true, error: null })

    try {
      const maxFee = await fetchMaxBuilderFee(walletAddress, BUILDER_ADDRESS)
      if (maxFee >= BUILDER_FEE) {
        set({ builderFeeApproved: true, enabling: false })
        return
      }

      const feeNonce = Date.now()
      const feeSig = await signApproveBuilderFee(
        walletClient,
        BUILDER_ADDRESS as `0x${string}`,
        '0.1%',
        feeNonce
      )

      await postExchange({
        action: {
          type: 'approveBuilderFee',
          hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
          signatureChainId: '0x66eee',
          maxFeeRate: '0.1%',
          builder: BUILDER_ADDRESS,
          nonce: feeNonce,
        },
        nonce: feeNonce,
        signature: feeSig,
      })

      set({ builderFeeApproved: true, enabling: false })
    } catch (err) {
      set({ enabling: false, error: (err as Error).message })
      throw err
    }
  },
}))
