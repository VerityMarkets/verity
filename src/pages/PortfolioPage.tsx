import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { Positions } from '@/components/portfolio/Positions'
import { OpenOrders } from '@/components/portfolio/OpenOrders'
import { TradeHistory } from '@/components/portfolio/TradeHistory'

export function PortfolioPage() {
  const { address, isConnected } = useAccount()
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio)
  const subscribePortfolio = usePortfolioStore((s) => s.subscribePortfolio)
  const unsubscribePortfolio = usePortfolioStore((s) => s.unsubscribePortfolio)
  useEffect(() => {
    if (address) {
      fetchPortfolio(address)
      subscribePortfolio(address)
    }
    return () => unsubscribePortfolio()
  }, [address])

  if (!isConnected) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-200 mb-1">
          Connect your wallet
        </h2>
        <p className="text-sm text-gray-500">
          Connect to view your positions and trade history
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Portfolio</h1>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Positions
          </h2>
          <Positions />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Open Orders
          </h2>
          <OpenOrders />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Trade History
          </h2>
          <TradeHistory />
        </section>
      </div>
    </div>
  )
}
