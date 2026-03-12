import { Link, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { IS_TESTNET } from '@/config'
import { useChatStore } from '@/stores/chatStore'

export function Header() {
  const location = useLocation()
  const toggleChat = useChatStore((s) => s.toggleChat)
  const isChatOpen = useChatStore((s) => s.isOpen)

  return (
    <header className="glass sticky top-0 z-50 border-b border-white/5">
      <div className="max-w-[1800px] mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo + Nav */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <span className="text-xs font-bold text-gray-950">V</span>
            </div>
            <span className="font-bold text-lg text-gray-100 hidden sm:block">
              Verity
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <NavLink to="/" active={location.pathname === '/'}>
              Markets
            </NavLink>
            <NavLink
              to="/portfolio"
              active={location.pathname === '/portfolio'}
            >
              Portfolio
            </NavLink>
          </nav>

          {IS_TESTNET && (
            <span className="text-[10px] font-mono font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              TESTNET
            </span>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleChat}
            className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isChatOpen
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                : 'bg-surface-2 text-gray-400 hover:text-gray-200 border border-white/5'
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            Chat
          </button>

          <ConnectButton
            chainStatus="none"
            showBalance={false}
            accountStatus={{
              smallScreen: 'avatar',
              largeScreen: 'address',
            }}
          />
        </div>
      </div>
    </header>
  )
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-surface-3 text-gray-100'
          : 'text-gray-400 hover:text-gray-200 hover:bg-surface-2'
      }`}
    >
      {children}
    </Link>
  )
}
