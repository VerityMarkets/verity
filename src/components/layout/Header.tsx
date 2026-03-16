import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDisconnect } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Hashicon } from '@/components/chat/Hashicon'
import { VerityWordmark } from '@/components/VerityWordmark'
import { SearchDropdown } from './SearchDropdown'
import { DepositModal } from '@/components/portfolio/DepositModal'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { categories } from '@/categories'

export function Header() {
  const [showDeposit, setShowDeposit] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { disconnect } = useDisconnect()

  // Close account menu on outside click
  useEffect(() => {
    if (!showAccountMenu) return
    function handleClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showAccountMenu])

  const activeCategory = searchParams.get('cat') || 'trending'

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

  function selectCategory(catId: string) {
    navigate(`/?cat=${catId}`)
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
            {categories.map((cat) => (
              <span key={cat.id} className="contents">
                {cat.dividerBefore && <span className="w-px h-4 bg-white/10 mx-1" />}
                <button
                  onClick={() => selectCategory(cat.id)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === cat.id && location.pathname === '/'
                      ? 'text-amber-400'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {cat.label}
                </button>
              </span>
            ))}
          </nav>

          {/* Search (desktop) / spacer (mobile) */}
          <div className="flex-1 md:hidden" />
          <SearchDropdown className="flex-1 hidden md:block" />

          {/* Why Verity — info link (Polymarket-style) */}
          <Link
            to="/about"
            className="hidden md:flex items-center gap-1.5 mr-4 text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Why Verity?
          </Link>

          {/* Why Verity — mobile only (moves into right group) */}
          <Link
            to="/about"
            className="md:hidden flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Why Verity?
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <ConnectButton.Custom>
              {({ account, chain, openConnectModal, mounted }) => {
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
                        <div className="relative" ref={accountMenuRef}>
                          <button
                            onClick={() => setShowAccountMenu((v) => !v)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
                          >
                            <Hashicon value={account.address} size={18} />
                            <span className="text-sm font-medium text-gray-200 hidden sm:block">
                              {account.displayName}
                            </span>
                          </button>
                          {showAccountMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-2 border border-white/10 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(account.address)
                                  setShowAccountMenu(false)
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-surface-3 transition-colors"
                              >
                                Copy Address
                              </button>
                              <button
                                onClick={() => {
                                  setShowAccountMenu(false)
                                  disconnect()
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-surface-3 transition-colors"
                              >
                                Disconnect
                              </button>
                            </div>
                          )}
                        </div>
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
            <span key={cat.id} className="contents">
              {cat.dividerBefore && <span className="w-px h-4 bg-white/10 mx-1 shrink-0" />}
              <button
                onClick={() => selectCategory(cat.id)}
                className={`${i === 0 ? 'pl-0 pr-3' : 'px-3'} py-1 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat.id && location.pathname === '/'
                    ? 'text-amber-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {cat.label}
              </button>
            </span>
          ))}
        </div>
      </header>

      {showDeposit && <DepositModal onClose={() => setShowDeposit(false)} />}
    </>
  )
}
