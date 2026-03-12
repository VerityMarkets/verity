import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { useAccount, useWalletClient } from 'wagmi'
import { parseCoin } from '@/lib/hyperliquid/encoding'
import { signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange } from '@/lib/hyperliquid/api'
import toast from 'react-hot-toast'

export function OpenOrders() {
  const openOrders = usePortfolioStore((s) => s.openOrders)
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio)
  const markets = useMarketStore((s) => s.markets)
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()

  async function cancelOrder(oid: number, coin: string) {
    if (!walletClient || !address) return

    const parsed = parseCoin(coin)
    if (!parsed) return

    const assetId = 100_000_000 + parsed.outcomeId * 10 + parsed.side

    try {
      const action = {
        type: 'cancel' as const,
        cancels: [{ a: assetId, o: oid }],
      }

      const nonce = Date.now()
      const sig = await signL1Action(walletClient, action, nonce)

      await postExchange({ action, nonce, signature: sig })
      toast.success('Order cancelled')
      if (address) fetchPortfolio(address)
    } catch (err) {
      toast.error('Failed to cancel order')
    }
  }

  if (openOrders.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-400 text-sm">No open orders</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-gray-500 uppercase font-mono border-b border-white/5">
              <th className="text-left px-4 py-3">Market</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Size</th>
              <th className="text-right px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {openOrders.map((order) => {
              const parsed = parseCoin(order.coin)
              const market = parsed
                ? markets.find((m) => m.outcomeId === parsed.outcomeId)
                : null
              const sideName = market && parsed
                ? market.sideNames[parsed.side] ?? 'Unknown'
                : order.coin
              const isBuy = order.side === 'B'

              return (
                <tr
                  key={order.oid}
                  className="border-b border-white/3 hover:bg-surface-2/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-gray-200">
                    {market?.underlying || market?.name || order.coin}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-semibold ${
                        isBuy ? 'text-yes' : 'text-no'
                      }`}
                    >
                      {isBuy ? 'Buy' : 'Sell'} {sideName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {Math.round(parseFloat(order.limitPx) * 100)}¢
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-200 font-mono">
                    {parseFloat(order.sz).toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => cancelOrder(order.oid, order.coin)}
                      className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
