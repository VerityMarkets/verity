import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'

export function ChatInput({ marketTag }: { marketTag?: string }) {
  const [text, setText] = useState('')
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return

    setSending(true)
    try {
      await sendMessage(text.trim(), undefined, undefined, marketTag)
      setText('')
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Say something..."
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
  )
}
