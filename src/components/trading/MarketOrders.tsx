import { usePortfolioStore } from '@/stores/portfolioStore'
import { useAgentStore } from '@/stores/agentStore'
import { useAccount } from 'wagmi'
import { parseCoin } from '@/lib/hyperliquid/encoding'
import { signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange } from '@/lib/hyperliquid/api'
import { DEV_MODE } from '@/config'
import { getDevSigner, devWalletInjected } from '@/lib/devWallet'
import toast from 'react-hot-toast'
import type { ParsedMarket } from '@/lib/hyperliquid/types'

interface MarketOrdersProps {
  market: ParsedMarket
}

export function MarketOrders({ market }: MarketOrdersProps) {
  const openOrders = usePortfolioStore((s) => s.openOrders)
  const { address } = useAccount()
  const getAgentSigner = useAgentStore((s) => s.getAgentSigner)

  // Filter to orders for this market only
  const marketOrders = openOrders.filter((order) => {
    const parsed = parseCoin(order.coin)
    return parsed && parsed.outcomeId === market.outcomeId
  })

  if (marketOrders.length === 0) return null

  async function cancelOrder(oid: number, coin: string) {
    const signer = getAgentSigner(address) ?? (DEV_MODE && devWalletInjected ? getDevSigner() : null)
    if (!signer || !address) {
      toast.error('Wallet not connected')
      return
    }

    const parsed = parseCoin(coin)
    if (!parsed) return

    const assetId = 100_000_000 + parsed.outcomeId * 10 + parsed.side

    try {
      const action = {
        type: 'cancel' as const,
        cancels: [{ a: assetId, o: oid }],
      }
      const nonce = Date.now()
      const sig = await signL1Action(signer, action, nonce)
      await postExchange({ action, nonce, signature: sig })
      toast.success('Order cancelled')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-gray-300">Open Orders</span>
        <span className="text-[10px] font-semibold text-gray-500">{marketOrders.length}</span>
      </div>
      <div className="border-t border-white/5 px-4 py-2 space-y-2">
        {marketOrders.map((order) => {
          const parsed = parseCoin(order.coin)!
          const sideName = market.sideNames[parsed.side] ?? (parsed.side === 0 ? 'Yes' : 'No')
          const isBuy = order.side === 'B'
          const price = Math.round(parseFloat(order.limitPx) * 100)
          const size = parseFloat(order.sz).toFixed(0)

          return (
            <div
              key={order.oid}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400">
                  {isBuy ? 'Buy' : 'Sell'}
                </span>
                <span className={`font-semibold px-1.5 py-0.5 rounded ${
                  parsed.side === 0 ? 'bg-yes/10 text-yes' : 'bg-no/10 text-no'
                }`}>
                  {size} {sideName}
                </span>
                <span className="text-white">
                  @ {price}¢
                </span>
              </div>
              <button
                onClick={() => cancelOrder(order.oid, order.coin)}
                className="text-red-400/70 hover:text-red-300 font-medium transition-colors cursor-pointer shrink-0 ml-2"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
