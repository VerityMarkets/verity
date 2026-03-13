import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Positions } from '@/components/portfolio/Positions'
import { OpenOrders } from '@/components/portfolio/OpenOrders'
import { TradeHistory } from '@/components/portfolio/TradeHistory'
import { DepositModal } from '@/components/portfolio/DepositModal'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'

type PortfolioTab = 'positions' | 'orders' | 'history'

const tabs: { key: PortfolioTab; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Open Orders' },
  { key: 'history', label: 'History' },
]

export function PortfolioPage() {
  const { isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<PortfolioTab>('positions')
  const [search, setSearch] = useState('')
  const [showDeposit, setShowDeposit] = useState(false)
  const [depositTab, setDepositTab] = useState<'deposit' | 'withdraw'>('deposit')

  const spotBalances = usePortfolioStore((s) => s.spotBalances)
  const balances = usePortfolioStore((s) => s.balances)
  const quoteCoin = useMarketStore((s) => s.outcomeQuoteCoin) || 'USDC'
  const mids = useMarketStore((s) => s.mids)

  const cashValue =
    (spotBalances['USDC'] ?? 0) +
    (quoteCoin !== 'USDC' ? (spotBalances[quoteCoin] ?? 0) : 0)

  let portfolioValue = 0
  for (const b of balances) {
    const midCoin = '#' + b.coin.slice(1)
    const mid = mids[midCoin] ? parseFloat(mids[midCoin]) : 0
    const sz = parseFloat(b.total)
    portfolioValue += sz * mid
  }

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
      {/* Portfolio summary card */}
      <div className="card p-5 mb-4 max-w-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Portfolio</div>
            <div className="text-2xl font-bold text-gray-100">
              ${(portfolioValue + cashValue).toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mb-1">Available to trade</div>
            <div className="text-lg font-semibold text-gray-100">
              ${cashValue.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setDepositTab('deposit'); setShowDeposit(true) }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors"
          >
            Deposit
          </button>
          <button
            onClick={() => { setDepositTab('withdraw'); setShowDeposit(true) }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-surface-2 hover:bg-surface-3 text-gray-200 border border-white/5 transition-colors"
          >
            Withdraw
          </button>
        </div>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 sm:max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30"
          />
        </div>

        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-amber-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'positions' && <Positions search={search} />}
      {activeTab === 'orders' && <OpenOrders search={search} />}
      {activeTab === 'history' && <TradeHistory search={search} />}

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} initialTab={depositTab} />}
    </div>
  )
}
