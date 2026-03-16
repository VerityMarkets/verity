import { useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useChatStore } from '@/stores/chatStore'
import { useMarketStore } from '@/stores/marketStore'
import { deriveNostrKeypair } from '@/lib/nostr/identity'
import { ChatMessage } from '../chat/ChatMessage'
import { ChatInput } from '../chat/ChatInput'

export function ChatSidebar() {
  const isOpen = useChatStore((s) => s.isOpen)
  const setOpen = useChatStore((s) => s.setOpen)
  const filter = useChatStore((s) => s.filter)
  const setFilter = useChatStore((s) => s.setFilter)
  const messages = useChatStore((s) => s.messages)
  const nostrPubkey = useChatStore((s) => s.nostrPubkey)
  const setIdentity = useChatStore((s) => s.setIdentity)
  const selectedMarketId = useMarketStore((s) => s.selectedMarketId)
  const markets = useMarketStore((s) => s.markets)

  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const filteredMessages =
    filter === 'global'
      ? messages
      : messages.filter((m) => m.marketTag === filter || m.marketTag === null)

  // Auto-derive Nostr identity when wallet connects
  useEffect(() => {
    if (isConnected && address && !nostrPubkey) {
      deriveNostrKeypair(async (msg) => {
        return signMessageAsync({ message: msg })
      }, address).then(({ privkey, pubkey }) => {
        setIdentity(pubkey, privkey, address)
      }).catch(() => {
        // User rejected signing, that's ok
      })
    }
  }, [isConnected, address])

  // Desktop sidebar
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed right-0 top-14 bottom-0 w-80 bg-surface-1 border-l border-white/5 transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ChatContent
          filter={filter}
          setFilter={setFilter}
          filteredMessages={filteredMessages}
          selectedMarketId={selectedMarketId}
          markets={markets}
          isConnected={isConnected}
          nostrPubkey={nostrPubkey}
        />
      </aside>

      {/* Mobile bottom sheet */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-surface-1 rounded-t-2xl border-t border-white/5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-surface-4" />
            </div>
            <ChatContent
              filter={filter}
              setFilter={setFilter}
              filteredMessages={filteredMessages}
              selectedMarketId={selectedMarketId}
              markets={markets}
              isConnected={isConnected}
              nostrPubkey={nostrPubkey}
            />
          </div>
        </div>
      )}
    </>
  )
}

function ChatContent({
  filter,
  setFilter,
  filteredMessages,
  selectedMarketId,
  markets,
  isConnected,
  nostrPubkey,
}: {
  filter: string
  setFilter: (f: string) => void
  filteredMessages: ReturnType<typeof useChatStore.getState>['messages']
  selectedMarketId: number | null
  markets: ReturnType<typeof useMarketStore.getState>['markets']
  isConnected: boolean
  nostrPubkey: string | null
}) {
  const selectedMarket = selectedMarketId
    ? markets.find((m) => m.outcomeId === selectedMarketId)
    : null

  return (
    <>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5">
        <button
          onClick={() => setFilter('global')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            filter === 'global'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Global
        </button>
        {selectedMarket && (
          <button
            onClick={() => setFilter(String(selectedMarketId))}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors truncate max-w-[120px] ${
              filter === String(selectedMarketId)
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {selectedMarket.underlying || selectedMarket.name}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Be the first!
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/5">
        {isConnected && nostrPubkey ? (
          <ChatInput />
        ) : (
          <p className="text-center text-gray-500 text-xs py-2">
            Connect wallet to chat
          </p>
        )}
      </div>
    </>
  )
}
