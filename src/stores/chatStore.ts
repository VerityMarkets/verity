import { create } from 'zustand'
import { nostrClient } from '@/lib/nostr/client'
import { COMMENT_KIND, REACTION_KIND } from '@/lib/nostr/types'
import type { ChatMessage } from '@/lib/nostr/types'

type ChatFilter = 'global' | string // string = market ID

interface ChatStore {
  messages: ChatMessage[]
  reactions: Map<string, Set<string>> // eventId -> set of pubkeys
  filter: ChatFilter
  isOpen: boolean
  nostrPubkey: string | null
  nostrPrivkey: Uint8Array | null
  evmAddress: string | null
  setIdentity: (pubkey: string, privkey: Uint8Array, evmAddress: string) => void
  clearIdentity: () => void
  setFilter: (filter: ChatFilter) => void
  toggleChat: () => void
  setOpen: (open: boolean) => void
  subscribeChat: () => void
  unsubscribeChat: () => void
  sendMessage: (content: string, parentId?: string, parentPubkey?: string) => Promise<void>
  reactToMessage: (eventId: string, eventPubkey: string) => Promise<void>
  getFilteredMessages: () => ChatMessage[]
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  reactions: new Map(),
  filter: 'global',
  isOpen: false,
  nostrPubkey: null,
  nostrPrivkey: null,
  evmAddress: null,

  setIdentity: (pubkey, privkey, evmAddress) => {
    set({ nostrPubkey: pubkey, nostrPrivkey: privkey, evmAddress })
  },

  clearIdentity: () => {
    set({ nostrPubkey: null, nostrPrivkey: null, evmAddress: null })
  },

  setFilter: (filter) => set({ filter }),

  toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),

  setOpen: (open) => set({ isOpen: open }),

  subscribeChat: () => {
    nostrClient.connect()

    // Subscribe to comments
    nostrClient.subscribe(
      'verity-comments',
      [
        {
          kinds: [COMMENT_KIND],
          '#K': ['verity:market', 'verity:global'] as never,
          limit: 100,
        } as never,
      ],
      (event) => {
        const marketTag =
          event.tags.find(
            (t) => t[0] === 'I' && t[1]?.startsWith('verity:market:')
          )?.[1]
            ?.replace('verity:market:', '') ?? null

        const parentId = event.tags.find((t) => t[0] === 'e')?.[1] ?? null
        const parentPubkey = event.tags.find((t) => t[0] === 'p')?.[1] ?? null
        const evmAddress = event.tags.find((t) => t[0] === 'evm')?.[1] ?? undefined

        const msg: ChatMessage = {
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          createdAt: event.created_at,
          marketTag,
          parentId,
          parentPubkey,
          reactions: 0,
          userReacted: false,
          evmAddress,
        }

        set((state) => {
          // Avoid duplicates
          if (state.messages.some((m) => m.id === msg.id)) return state
          const messages = [msg, ...state.messages]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 500)
          return { messages }
        })
      }
    )

    // Subscribe to reactions
    nostrClient.subscribe(
      'verity-reactions',
      [
        {
          kinds: [REACTION_KIND],
          limit: 500,
        },
      ],
      (event) => {
        const targetId = event.tags.find((t) => t[0] === 'e')?.[1]
        if (!targetId) return

        set((state) => {
          const reactions = new Map(state.reactions)
          const pubkeys = reactions.get(targetId) ?? new Set()
          pubkeys.add(event.pubkey)
          reactions.set(targetId, pubkeys)

          // Update message reaction counts
          const messages = state.messages.map((m) => {
            if (m.id === targetId) {
              return {
                ...m,
                reactions: pubkeys.size,
                userReacted: state.nostrPubkey
                  ? pubkeys.has(state.nostrPubkey)
                  : false,
              }
            }
            return m
          })

          return { reactions, messages }
        })
      }
    )
  },

  unsubscribeChat: () => {
    nostrClient.unsubscribe('verity-comments')
    nostrClient.unsubscribe('verity-reactions')
  },

  sendMessage: async (content, parentId, parentPubkey) => {
    const { nostrPrivkey, nostrPubkey, evmAddress, filter } = get()
    if (!nostrPrivkey || !nostrPubkey) return

    const marketTag = filter !== 'global' ? filter : undefined

    await nostrClient.publishComment(
      content,
      nostrPrivkey,
      nostrPubkey,
      marketTag,
      parentId,
      parentPubkey,
      evmAddress ?? undefined
    )
  },

  reactToMessage: async (eventId, eventPubkey) => {
    const { nostrPrivkey, nostrPubkey } = get()
    if (!nostrPrivkey || !nostrPubkey) return

    await nostrClient.publishReaction(eventId, eventPubkey, nostrPrivkey, nostrPubkey)
  },

  getFilteredMessages: () => {
    const { messages, filter } = get()
    if (filter === 'global') return messages
    return messages.filter((m) => m.marketTag === filter)
  },
}))
