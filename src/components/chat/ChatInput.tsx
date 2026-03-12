import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'

export function ChatInput() {
  const [text, setText] = useState('')
  const sendMessage = useChatStore((s) => s.sendMessage)
  const [sending, setSending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || sending) return

    setSending(true)
    try {
      await sendMessage(text.trim())
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    </form>
  )
}
