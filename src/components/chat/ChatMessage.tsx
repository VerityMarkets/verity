import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage as ChatMessageType } from '@/lib/nostr/types'

function truncatePubkey(pubkey: string): string {
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-4)}`
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const reactToMessage = useChatStore((s) => s.reactToMessage)
  const nostrPubkey = useChatStore((s) => s.nostrPubkey)

  return (
    <div className="group py-1.5 hover:bg-surface-2/50 rounded px-1.5 -mx-1.5 transition-colors">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-amber-400/80 shrink-0">
          {truncatePubkey(message.pubkey)}
        </span>
        <span className="text-[10px] text-gray-500">
          {timeAgo(message.createdAt)}
        </span>
        {message.marketTag && (
          <span className="text-[10px] text-amber-500/50 bg-amber-500/5 px-1 rounded">
            {message.marketTag}
          </span>
        )}
      </div>

      {message.parentId && (
        <div className="text-[10px] text-gray-500 pl-2 border-l border-surface-4 ml-1 mt-0.5 mb-0.5 truncate">
          replying...
        </div>
      )}

      <p className="text-sm text-gray-200 break-words leading-relaxed">
        {message.content}
      </p>

      {/* Reactions */}
      <div className="flex items-center gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {nostrPubkey && (
          <button
            onClick={() => reactToMessage(message.id, message.pubkey)}
            className={`flex items-center gap-1 text-[10px] transition-colors ${
              message.userReacted
                ? 'text-amber-400'
                : 'text-gray-500 hover:text-amber-400'
            }`}
          >
            <svg className="w-3 h-3" fill={message.userReacted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            {message.reactions > 0 && message.reactions}
          </button>
        )}
      </div>
    </div>
  )
}
