import { Link } from 'react-router-dom'
import { useChatStore } from '@/stores/chatStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import type { ChatMessage as ChatMessageType } from '@/lib/nostr/types'
import { Hashicon } from './Hashicon'

function truncateHex(hex: string): string {
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`
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

export interface MarketCtx {
  yesToken: string
  noToken: string
  sideNames: [string, string]
}

interface ChatMessageProps {
  message: ChatMessageType
  /** Current chat filter — hides market tag when it matches */
  activeFilter?: string
  /** Market context for showing position badges on filtered pages */
  marketCtx?: MarketCtx
  /** The market page we're currently on (even when viewing global filter) */
  currentMarketId?: string
}

export function ChatMessage({ message, activeFilter, marketCtx, currentMarketId }: ChatMessageProps) {
  const reactToMessage = useChatStore((s) => s.reactToMessage)
  const nostrPubkey = useChatStore((s) => s.nostrPubkey)
  const evmAddress = useChatStore((s) => s.evmAddress)
  const getBalance = usePortfolioStore((s) => s.getBalance)

  const isCurrentMarket = !!(currentMarketId && message.marketTag === currentMarketId)
  const showMarketTag = message.marketTag && message.marketTag !== activeFilter
  const displayId = message.evmAddress ?? message.pubkey
  const displayLabel = message.evmAddress
    ? `${message.evmAddress.slice(0, 6)}…${message.evmAddress.slice(-4)}`
    : truncateHex(message.pubkey)

  // Show position badge for the current user on market-filtered pages
  const isOwnMessage = message.evmAddress && evmAddress &&
    message.evmAddress.toLowerCase() === evmAddress.toLowerCase()
  let positionBadge: { label: string; color: string } | null = null
  if (isOwnMessage && marketCtx) {
    const yesBal = getBalance(marketCtx.yesToken)
    const noBal = getBalance(marketCtx.noToken)
    if (yesBal > 0) {
      positionBadge = { label: `${Math.floor(yesBal)} ${marketCtx.sideNames[0]}`, color: 'text-yes bg-yes/15' }
    } else if (noBal > 0) {
      positionBadge = { label: `${Math.floor(noBal)} ${marketCtx.sideNames[1]}`, color: 'text-no bg-no/15' }
    }
  }

  return (
    <div className="group py-1.5 hover:bg-surface-2/50 rounded px-1.5 -mx-1.5 transition-colors">
      <div className="flex items-center gap-1.5">
        <Hashicon value={displayId} size={16} />
        <span className="text-xs font-mono text-amber-400/80 shrink-0">
          {displayLabel}
        </span>
        <span className="text-[10px] text-gray-500">
          {timeAgo(message.createdAt)}
        </span>
        {showMarketTag && (
          isCurrentMarket ? (
            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 rounded">
              #{message.marketTag}
            </span>
          ) : (
            <Link
              to={`/market/${message.marketTag}`}
              className="text-[10px] text-amber-500/50 bg-amber-500/5 px-1 rounded cursor-pointer hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              #{message.marketTag}
            </Link>
          )
        )}
        {positionBadge && (
          <span className={`text-[10px] font-semibold px-1.5 rounded-full leading-4 ${positionBadge.color}`}>
            {positionBadge.label}
          </span>
        )}
      </div>

      {message.parentId && (
        <div className="text-[10px] text-gray-500 pl-2 border-l border-surface-4 ml-1 mt-0.5 mb-0.5 truncate">
          replying...
        </div>
      )}

      <p className="text-sm text-gray-200 break-words leading-relaxed mt-1">
        {message.content}
      </p>

      {/* Reactions */}
      <div className="flex items-center gap-2 mt-0.5">
        <button
          onClick={() => nostrPubkey && reactToMessage(message.id, message.pubkey)}
          disabled={!nostrPubkey}
          className={`flex items-center gap-1 text-[10px] transition-colors ${
            message.userReacted
              ? 'text-amber-400'
              : 'text-gray-400 hover:text-amber-400 disabled:hover:text-gray-400'
          } disabled:cursor-default`}
        >
          <svg className="w-3 h-3" fill={message.userReacted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
          {message.reactions}
        </button>
      </div>
    </div>
  )
}
