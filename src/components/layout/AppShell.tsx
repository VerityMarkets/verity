import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Trollbox } from '@/components/chat/Trollbox'
import { hlWebSocket } from '@/lib/hyperliquid/websocket'
import { useMarketStore } from '@/stores/marketStore'
import { useChatStore } from '@/stores/chatStore'
import { restoreNostrKeypair } from '@/lib/nostr/identity'
import { toToken } from '@/lib/hyperliquid/encoding'
import { IS_TESTNET } from '@/config'

export function AppShell({ children }: { children: ReactNode }) {
  const fetchMarkets = useMarketStore((s) => s.fetchMarkets)
  const subscribeMids = useMarketStore((s) => s.subscribeMids)
  const selectedMarketId = useMarketStore((s) => s.selectedMarketId)
  const getMarketOrExpired = useMarketStore((s) => s.getMarketOrExpired)
  const subscribeChat = useChatStore((s) => s.subscribeChat)
  const nostrPubkey = useChatStore((s) => s.nostrPubkey)
  const setIdentity = useChatStore((s) => s.setIdentity)
  const chatOpen = useChatStore((s) => s.isOpen)
  const setChatOpen = useChatStore((s) => s.setOpen)

  // Build market context for mobile Trollbox
  const selectedMarket = selectedMarketId !== null ? getMarketOrExpired(selectedMarketId) : undefined
  const trollboxMarket = selectedMarket
    ? { id: selectedMarketId!, label: selectedMarket.underlying || selectedMarket.name }
    : undefined
  const trollboxMarketCtx = selectedMarket
    ? {
        yesToken: toToken(selectedMarket.outcomeId, 0),
        noToken: toToken(selectedMarket.outcomeId, 1),
        sideNames: selectedMarket.sideNames,
      }
    : undefined

  const { address, isConnected } = useAccount()

  useEffect(() => {
    hlWebSocket.connect()
    fetchMarkets()
    subscribeMids()
    subscribeChat()

    // Poll for new markets every 61s (catches new 15-min markets)
    const marketPoll = setInterval(() => fetchMarkets(), 61_000)

    return () => {
      hlWebSocket.disconnect()
      clearInterval(marketPoll)
    }
  }, [])

  // Silently restore Nostr identity from cached signature
  useEffect(() => {
    if (isConnected && address && !nostrPubkey) {
      const restored = restoreNostrKeypair(address)
      if (restored) {
        setIdentity(restored.pubkey, restored.privkey, address)
      }
    }
  }, [isConnected, address])

  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 pb-20 lg:pb-4">
          {children}
        </div>
      </main>
      <MobileNav />

      {/* Mobile chat overlay */}
      {chatOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setChatOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-surface-1 rounded-t-2xl border-t border-white/5 flex flex-col" style={{ height: '85vh' }}>
            <div className="flex items-center justify-center py-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-surface-4" />
            </div>
            <Trollbox
              market={trollboxMarket}
              marketCtx={trollboxMarketCtx}
              className="flex-1 min-h-0 border-0 rounded-none"
            />
          </div>
        </div>
      )}

      {/* Floating testnet badge */}
      {IS_TESTNET && (
        <div className="fixed bottom-16 left-4 lg:bottom-4 z-50">
          <span className="text-[10px] font-mono font-semibold text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20 backdrop-blur-sm">
            TESTNET
          </span>
        </div>
      )}
    </div>
  )
}
