/**
 * Dev mode: injects a minimal EIP-1193 provider backed by a local private key
 * onto window.ethereum so wagmi's injected connector picks it up automatically.
 *
 * If a real wallet extension (e.g. MetaMask) is already present, we skip
 * injection and let the user connect their real wallet instead.
 */
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'

const DEV_PRIVATE_KEY = (import.meta.env.VITE_DEV_PRIVATE_KEY ?? '') as Hex

const DEV_CHAIN_ID = 421614 // Arbitrum Sepolia

/** Whether the dev wallet was actually injected (no real extension present) */
export let devWalletInjected = false

export function injectDevWallet() {
  const account = privateKeyToAccount(DEV_PRIVATE_KEY)
  const address = account.address.toLowerCase() as Hex

  // Always expose the dev signer (useful as fallback even with extension)
  devSigner = {
    signTypedData: (args: Parameters<typeof account.signTypedData>[0]) =>
      account.signTypedData(args),
  }

  // If a real wallet extension already exists, skip injection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (window as any).ethereum
  if (existing && !existing.isDevWallet) {
    console.log(`[DevWallet] Real wallet extension detected, skipping injection. Dev signer still available as fallback.`)
    return
  }

  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

  const provider = {
    isMetaMask: true,
    isDevWallet: true,

    on(event: string, fn: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(fn)
    },

    removeListener(event: string, fn: (...args: unknown[]) => void) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn)
      }
    },

    async request({ method, params }: { method: string; params?: unknown[] }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [address]

        case 'eth_chainId':
          return `0x${DEV_CHAIN_ID.toString(16)}`

        case 'net_version':
          return String(DEV_CHAIN_ID)

        case 'wallet_switchEthereumChain':
          return null

        case 'wallet_addEthereumChain':
          return null

        case 'personal_sign': {
          const [message] = params as [Hex, string]
          const sig = await account.signMessage({
            message: { raw: message as Hex },
          })
          return sig
        }

        case 'eth_signTypedData_v4': {
          const [, dataStr] = params as [string, string]
          const data = JSON.parse(dataStr)

          // Convert numeric string types to proper BigInt where needed
          const processedMessage = { ...data.message }
          if (data.types) {
            for (const [typeName, fields] of Object.entries(data.types)) {
              if (typeName === 'EIP712Domain') continue
              for (const field of fields as Array<{ name: string; type: string }>) {
                if (
                  (field.type === 'uint64' || field.type === 'uint256') &&
                  processedMessage[field.name] !== undefined
                ) {
                  processedMessage[field.name] = BigInt(processedMessage[field.name])
                }
              }
            }
          }

          const sig = await account.signTypedData({
            domain: data.domain,
            types: data.types,
            primaryType: data.primaryType,
            message: processedMessage,
          })
          return sig
        }

        case 'eth_getBalance':
          return '0x0'

        case 'eth_estimateGas':
          return '0x5208'

        case 'eth_blockNumber':
          return '0x1'

        case 'eth_getCode':
          return '0x'

        default:
          console.warn(`[DevWallet] Unhandled method: ${method}`)
          throw new Error(`DevWallet: unsupported method ${method}`)
      }
    },
  }

  ;(window as unknown as Record<string, unknown>).ethereum = provider
  devWalletInjected = true

  console.log(`[DevWallet] Injected dev wallet: ${account.address}`)
}

/** Direct signer for dev mode — use when wagmi's useWalletClient returns null */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let devSigner: { signTypedData: (args: any) => Promise<`0x${string}`> } | null = null

export function getDevSigner() {
  return devSigner
}
