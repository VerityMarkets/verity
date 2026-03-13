import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import type { ChatMessage } from '@/lib/nostr/types'

interface ChatInputProps {
  replyingTo?: ChatMessage | null
  onCancelReply?: () => void
  onSent?: () => void
}

export function ChatInput({ replyingTo, onCancelReply, onSent }: ChatInputProps) {
  const [text, setText] = useState('')
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when replying
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus()
  }, [replyingTo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return

    setSending(true)
    try {
      await sendMessage(
        text.trim(),
        replyingTo?.id,
        replyingTo?.pubkey
      )
      setText('')
      onSent?.()
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  const replyLabel = replyingTo?.evmAddress
    ? `${replyingTo.evmAddress.slice(0, 6)}…${replyingTo.evmAddress.slice(-4)}`
    : replyingTo
      ? `${replyingTo.pubkey.slice(0, 6)}…${replyingTo.pubkey.slice(-4)}`
      : ''

  return (
    <div>
      {replyingTo && (
        <div className="flex items-center gap-2 mb-1.5 text-[10px] text-gray-400">
          <span className="flex-1 truncate">
            Replying to <span className="text-amber-400/80 font-mono">{replyLabel}</span>
          </span>
          <button
            onClick={onCancelReply}
            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyingTo ? 'Write a reply...' : 'Say something...'}
          className="input flex-1 text-sm py-1.5"
          maxLength={280}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="btn-primary px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l7-7 7 7M12 5v14" />
          </svg>
        </button>
      </form>
    </div>
  )
}
