import { useEffect, useState, useMemo } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useChatStore } from '@/stores/chatStore'
import { useChatBalanceStore } from '@/stores/chatBalanceStore'
import { deriveNostrKeypair } from '@/lib/nostr/identity'
import { ChatMessage } from './ChatMessage'
import type { MarketCtx } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { ChatMessage as ChatMessageType } from '@/lib/nostr/types'

interface TrollboxProps {
  /** Market-specific chat group key and label, omit for global-only */
  market?: { id: string; label: string }
  /** Token info for showing position badges */
  marketCtx?: MarketCtx
  className?: string
  style?: React.CSSProperties
}

export function Trollbox({ market, marketCtx, className = '', style }: TrollboxProps) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const chatFilter = useChatStore((s) => s.filter)
  const setFilter = useChatStore((s) => s.setFilter)
  const messages = useChatStore((s) => s.messages)
  const nostrPubkey = useChatStore((s) => s.nostrPubkey)
  const setIdentity = useChatStore((s) => s.setIdentity)
  const [signing, setSigning] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessageType | null>(null)
  const fetchBalances = useChatBalanceStore((s) => s.fetchBalances)

  // Reset filter to 'global' when Trollbox has no market context
  useEffect(() => {
    if (!market) setFilter('global')
  }, [market])

  // Clear reply when filter changes
  useEffect(() => {
    setReplyingTo(null)
  }, [chatFilter])

  const filteredMessages =
    chatFilter === 'global'
      ? messages
      : messages.filter((m) => m.marketTag === chatFilter)

  // Build parent snippet lookup
  const parentSnippets = useMemo(() => {
    const map = new Map<string, string>()
    for (const msg of messages) {
      if (msg.parentId) {
        const parent = messages.find((m) => m.id === msg.parentId)
        if (parent) {
          const label = parent.evmAddress
            ? `${parent.evmAddress.slice(0, 6)}…${parent.evmAddress.slice(-4)}`
            : `${parent.pubkey.slice(0, 6)}…${parent.pubkey.slice(-4)}`
          const snippet = parent.content.length > 50 ? parent.content.slice(0, 50) + '…' : parent.content
          map.set(msg.id, `${label}: ${snippet}`)
        }
      }
    }
    return map
  }, [messages])

  // Batch-fetch spot balances for all chat users with evmAddresses (when on a market page)
  useEffect(() => {
    if (!marketCtx) return
    const addresses = filteredMessages
      .filter((m) => m.evmAddress)
      .map((m) => m.evmAddress!)
    if (addresses.length === 0) return
    fetchBalances(addresses)
  }, [filteredMessages.length, marketCtx])

  return (
    <div className={`flex flex-col card overflow-hidden ${className}`} style={style}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-semibold text-gray-300">Trollbox</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('global')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              chatFilter === 'global'
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Global
          </button>
          {market && (
            <button
              onClick={() => setFilter(market.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors truncate max-w-[120px] ${
                chatFilter === market.id
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {market.label}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {filteredMessages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No messages yet. Be the first!
          </div>
        ) : (
          filteredMessages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                activeFilter={chatFilter}
                marketCtx={marketCtx}
                currentMarketId={market?.id}
                onReply={setReplyingTo}
                parentSnippet={parentSnippets.get(msg.id) ?? null}
              />
          ))
        )}
      </div>

      <div className="p-3 border-t border-white/5 shrink-0">
        {isConnected && nostrPubkey ? (
          <ChatInput
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onSent={() => setReplyingTo(null)}
          />
        ) : isConnected && address ? (
          <button
            onClick={async () => {
              setSigning(true)
              try {
                const { privkey, pubkey } = await deriveNostrKeypair(
                  (msg) => signMessageAsync({ message: msg }),
                  address
                )
                setIdentity(pubkey, privkey, address)
              } catch {
                // User rejected signing
              } finally {
                setSigning(false)
              }
            }}
            disabled={signing}
            className="w-full py-2 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
          >
            {signing ? 'Sign to continue...' : 'Start chatting'}
          </button>
        ) : (
          <p className="text-center text-gray-500 text-xs py-1">
            Connect wallet to chat
          </p>
        )}
      </div>
    </div>
  )
}
