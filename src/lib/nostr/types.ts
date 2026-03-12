export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface ChatMessage {
  id: string
  pubkey: string
  content: string
  createdAt: number
  marketTag: string | null
  parentId: string | null
  parentPubkey: string | null
  reactions: number
  userReacted: boolean
  evmAddress?: string
}

// NIP-22 comment kind
export const COMMENT_KIND = 1111
// NIP-25 reaction kind
export const REACTION_KIND = 7
// Nostr profile kind
export const PROFILE_KIND = 0
