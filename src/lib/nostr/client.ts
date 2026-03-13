import { NOSTR_RELAYS } from '@/config'
import { signNostrEvent } from './identity'
import { COMMENT_KIND, REACTION_KIND } from './types'

type EventCallback = (event: NostrRelayEvent) => void

interface NostrRelayEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

interface NostrFilter {
  kinds?: number[]
  '#I'?: string[]
  '#e'?: string[]
  authors?: string[]
  since?: number
  limit?: number
}

class NostrClient {
  private sockets: WebSocket[] = []
  private subscriptions = new Map<string, { filters: NostrFilter[]; callback: EventCallback }>()
  private seenIds = new Set<string>()
  private connected = false

  connect() {
    if (this.connected) return
    this.connected = true

    for (const relay of NOSTR_RELAYS) {
      this.connectRelay(relay)
    }
  }

  private connectRelay(url: string) {
    const ws = new WebSocket(url)

    ws.onopen = () => {
      this.sockets.push(ws)
      // Resubscribe
      for (const [id, sub] of this.subscriptions) {
        ws.send(JSON.stringify(['REQ', id, ...sub.filters]))
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg[0] === 'EVENT' && msg[2]) {
          const subId = msg[1] as string
          const nostrEvent = msg[2] as NostrRelayEvent

          // Deduplicate across relays
          if (this.seenIds.has(nostrEvent.id)) return
          this.seenIds.add(nostrEvent.id)

          // Keep set bounded
          if (this.seenIds.size > 10000) {
            const entries = [...this.seenIds]
            for (let i = 0; i < 5000; i++) {
              this.seenIds.delete(entries[i])
            }
          }

          const sub = this.subscriptions.get(subId)
          if (sub) {
            sub.callback(nostrEvent)
          }
        }
      } catch {
        // ignore
      }
    }

    ws.onclose = () => {
      this.sockets = this.sockets.filter((s) => s !== ws)
      if (this.connected) {
        setTimeout(() => this.connectRelay(url), 3000)
      }
    }

    ws.onerror = () => ws.close()
  }

  subscribe(id: string, filters: NostrFilter[], callback: EventCallback) {
    this.subscriptions.set(id, { filters, callback })
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['REQ', id, ...filters]))
      }
    }
  }

  unsubscribe(id: string) {
    this.subscriptions.delete(id)
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['CLOSE', id]))
      }
    }
  }

  publish(event: NostrRelayEvent) {
    for (const ws of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['EVENT', event]))
      }
    }
  }

  async publishComment(
    content: string,
    privkey: Uint8Array,
    pubkey: string,
    marketTag?: string,
    parentId?: string,
    parentPubkey?: string,
    evmAddress?: string
  ): Promise<NostrRelayEvent> {
    const tags: string[][] = []

    // Embed EVM address for display
    if (evmAddress) {
      tags.push(['evm', evmAddress])
    }

    // Market scope tag
    if (marketTag) {
      tags.push(['I', `verity:market:${marketTag}`, 'https://verity.trade'])
      tags.push(['K', 'verity:market'])
    }
    // Always add global tag
    tags.push(['I', 'verity:global', 'https://verity.trade'])
    tags.push(['K', 'verity:global'])

    // Reply threading
    if (parentId) {
      tags.push(['e', parentId])
      tags.push(['k', String(COMMENT_KIND)])
    }
    if (parentPubkey) {
      tags.push(['p', parentPubkey])
    }

    const event = {
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: COMMENT_KIND,
      tags,
      content,
    }

    const { id, sig } = signNostrEvent(event, privkey)
    const fullEvent = { ...event, id, sig }

    this.publish(fullEvent)
    return fullEvent
  }

  async publishReaction(
    eventId: string,
    eventPubkey: string,
    privkey: Uint8Array,
    pubkey: string
  ): Promise<NostrRelayEvent> {
    const event = {
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: REACTION_KIND,
      tags: [
        ['e', eventId],
        ['p', eventPubkey],
      ],
      content: '+',
    }

    const { id, sig } = signNostrEvent(event, privkey)
    const fullEvent = { ...event, id, sig }

    this.publish(fullEvent)
    return fullEvent
  }

  disconnect() {
    this.connected = false
    for (const ws of this.sockets) {
      ws.close()
    }
    this.sockets = []
    this.subscriptions.clear()
    this.seenIds.clear()
  }
}

export const nostrClient = new NostrClient()
