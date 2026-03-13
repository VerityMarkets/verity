import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Hashicon } from '@/components/chat/Hashicon'
import { VerityWordmark } from '@/components/VerityWordmark'
import { SearchDropdown } from './SearchDropdown'
import { DepositModal } from '@/components/portfolio/DepositModal'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { type Category } from '@/components/markets/CategoryBar'

const categories: Category[] = ['Trending', 'New', 'Sports', 'Crypto']

export function Header() {
  const [showDeposit, setShowDeposit] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const activeCategory = (searchParams.get('cat') as Category) || 'Trending'

  // Portfolio values
  const spotBalances = usePortfolioStore((s) => s.spotBalances)
  const balances = usePortfolioStore((s) => s.balances)
  const quoteCoin = useMarketStore((s) => s.outcomeQuoteCoin) || 'USDC'
  const mids = useMarketStore((s) => s.mids)

  const cashValue =
    (spotBalances['USDC'] ?? 0) +
    (quoteCoin !== 'USDC' ? (spotBalances[quoteCoin] ?? 0) : 0)

  // Portfolio value = sum of outcome token balances × mid price
  // Balance coins use '+' prefix (e.g. +8890), mids use '#' prefix (#8890)
  let portfolioValue = 0
  for (const b of balances) {
    const midCoin = '#' + b.coin.slice(1)
    const mid = mids[midCoin] ? parseFloat(mids[midCoin]) : 0
    const sz = parseFloat(b.total)
    portfolioValue += sz * mid
  }

  function selectCategory(cat: Category) {
    navigate(`/?cat=${cat}`)
  }

  return (
    <>
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center text-gray-100 shrink-0">
            <VerityWordmark className="h-5" />
          </Link>

          {/* Categories — desktop */}
          <nav className="hidden md:flex items-center gap-1 shrink-0">
            {categories.map((cat, i) => (
              <span key={cat} className="contents">
                {i === 2 && <span className="w-px h-4 bg-white/10 mx-1" />}
                <button
                  onClick={() => selectCategory(cat)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === cat && location.pathname === '/'
                      ? 'text-amber-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {cat}
                </button>
              </span>
            ))}
          </nav>

          {/* Search */}
          <SearchDropdown className="flex-1 max-w-md hidden md:block" />

          {/* Spacer — absorbs remaining space to push right items to edge */}
          <div className="flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
                const connected = mounted && account && chain
                return (
                  <div
                    {...(!mounted && {
                      'aria-hidden': true,
                      style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
                    })}
                  >
                    {connected ? (
                      <div className="flex items-center gap-2">
                        {/* Portfolio + Cash values — stacked labels */}
                        <button
                          onClick={() => navigate('/portfolio')}
                          className="hidden sm:flex items-center gap-4 px-3 py-1 transition-colors hover:bg-surface-2 rounded-lg"
                        >
                          <div className="text-center">
                            <div className="text-[10px] text-gray-500 leading-tight">Positions</div>
                            <div className="text-sm font-semibold text-gray-100">${portfolioValue.toFixed(2)}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] text-gray-500 leading-tight">Cash</div>
                            <div className="text-sm font-semibold text-gray-100">${cashValue.toFixed(2)}</div>
                          </div>
                        </button>

                        <button
                          onClick={() => setShowDeposit(true)}
                          className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors"
                        >
                          Deposit
                        </button>
                        <button
                          onClick={openAccountModal}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
                        >
                          <Hashicon value={account.address} size={18} />
                          <span className="text-sm font-medium text-gray-200 hidden sm:block">
                            {account.displayName}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={openConnectModal}
                        className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                )
              }}
            </ConnectButton.Custom>
          </div>
        </div>

        {/* Categories — mobile, inside header */}
        <div className="md:hidden max-w-7xl mx-auto flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {categories.map((cat, i) => (
            <span key={cat} className="contents">
              {i === 2 && <span className="w-px h-4 bg-white/10 mx-1 shrink-0" />}
              <button
                onClick={() => selectCategory(cat)}
                className={`${i === 0 ? 'pl-0 pr-3' : 'px-3'} py-1 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat && location.pathname === '/'
                    ? 'text-amber-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {cat}
              </button>
            </span>
          ))}
        </div>
      </header>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
    </>
  )
}
