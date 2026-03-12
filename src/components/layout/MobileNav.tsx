import { Link, useLocation } from 'react-router-dom'
import { useChatStore } from '@/stores/chatStore'

export function MobileNav() {
  const location = useLocation()
  const toggleChat = useChatStore((s) => s.toggleChat)

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass border-t border-white/5 z-50">
      <div className="flex items-center justify-around h-14">
        <MobileNavLink to="/" active={location.pathname === '/'}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-[10px]">Markets</span>
        </MobileNavLink>

        <MobileNavLink to="/portfolio" active={location.pathname === '/portfolio'}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <span className="text-[10px]">Portfolio</span>
        </MobileNavLink>

        <button
          onClick={toggleChat}
          className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-amber-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[10px]">Chat</span>
        </button>
      </div>
    </nav>
  )
}

function MobileNavLink({
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
      className={`flex flex-col items-center gap-0.5 transition-colors ${
        active ? 'text-amber-400' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {children}
    </Link>
  )
}
