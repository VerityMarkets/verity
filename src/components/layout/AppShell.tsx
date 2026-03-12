import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { ChatSidebar } from './ChatSidebar'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { useMarketStore } from '@/stores/marketStore'
import { useChatStore } from '@/stores/chatStore'

export function AppShell({ children }: { children: ReactNode }) {
  const fetchMarkets = useMarketStore((s) => s.fetchMarkets)
  const subscribeMids = useMarketStore((s) => s.subscribeMids)
  const subscribeChat = useChatStore((s) => s.subscribeChat)
  const isChatOpen = useChatStore((s) => s.isOpen)

  useEffect(() => {
    hlWebSocket.connect()
    fetchMarkets()
    subscribeMids()
    subscribeChat()

    return () => {
      hlWebSocket.disconnect()
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main
          className={`flex-1 overflow-y-auto transition-all duration-300 ${
            isChatOpen ? 'lg:mr-80' : ''
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 py-4 pb-20 lg:pb-4">
            {children}
          </div>
        </main>
        <ChatSidebar />
      </div>
      <MobileNav />
    </div>
  )
}
