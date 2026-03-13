import { create } from 'zustand'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { signApproveAgent, signApproveBuilderFee, signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange, fetchMaxBuilderFee } from '@/lib/hyperliquid/api'
import { BUILDER_ADDRESS, BUILDER_FEE, IS_TESTNET } from '@/config'

// ---------------------------------------------------------------------------
// localStorage keys (scoped per network + wallet address)
// ---------------------------------------------------------------------------

function storageKey(address: string): string {
  const net = IS_TESTNET ? 'testnet' : 'mainnet'
  return `verity:agent:${net}:${address.toLowerCase()}`
}

interface StoredAgent {
  privateKey: Hex
  address: Hex
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
  /** Agent private key (hex) — null if not set up */
  agentKey: Hex | null
  /** Agent address derived from key */
  agentAddress: Hex | null
  /** The parent wallet address this agent is authorized for */
  parentAddress: string | null
  /** Whether the enable-trading flow is in progress */
  enabling: boolean
  /** Error from last enable attempt */
  error: string | null

  /** Load persisted agent for a wallet address */
  load: (walletAddress: string) => void
  /** Clear agent (e.g. on wallet disconnect) */
  clear: () => void
  /** Returns an L1 signer using the agent key, or null. Pass address to validate ownership. */
  getAgentSigner: (forAddress?: string) => ReturnType<typeof createAgentSigner> | null
  /**
   * Full enable-trading flow:
   * 1. Generate agent keypair
   * 2. Approve agent on-chain (user signs once)
   * 3. Approve builder fee if needed (user signs once)
   * 4. Persist agent key to localStorage
   */
  enableTrading: (
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

  load: (walletAddress: string) => {
    const key = storageKey(walletAddress)
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const stored: StoredAgent = JSON.parse(raw)
        set({
          agentKey: stored.privateKey,
          agentAddress: stored.address,
          parentAddress: walletAddress,
          error: null,
        })
        return
      }
    } catch {
      // Corrupted data — clear it
      localStorage.removeItem(storageKey(walletAddress))
    }
    set({
      agentKey: null,
      agentAddress: null,
      parentAddress: walletAddress,
      error: null,
    })
  },

  clear: () => {
    set({
      agentKey: null,
      agentAddress: null,
      parentAddress: null,
      error: null,
    })
  },

  getAgentSigner: (forAddress?: string) => {
    const { agentKey, parentAddress } = get()
    if (!agentKey) return null
    // If an address is provided, verify the agent belongs to this wallet
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

      // 3. Approve builder fee if needed
      const hasRealBuilder =
        BUILDER_ADDRESS !== '0x0000000000000000000000000000000000000000'

      if (hasRealBuilder) {
        try {
          const maxFee = await fetchMaxBuilderFee(walletAddress, BUILDER_ADDRESS)
          if (maxFee < BUILDER_FEE) {
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
          }
        } catch {
          // Non-fatal — orders can still work, just without builder fee
        }
      }

      // 4. Persist to localStorage
      const stored: StoredAgent = {
        privateKey: agentPrivKey,
        address: agentAddr,
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
}))
