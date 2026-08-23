import { WS_URL } from '@/config'
import type { WsSubscription } from './types'

type MessageHandler = (data: unknown) => void

interface Subscription {
  subscription: WsSubscription
  handler: MessageHandler
}

/**
 * Single shared Hyperliquid WebSocket.
 *
 * Reliability notes (verified against mainnet, Aug 2026):
 *  - HL closes a connection that has been silent for 60 s; we send
 *    `{"method":"ping"}` every 30 s and treat 75 s without *any* inbound frame
 *    (pong counts) as a half-open socket and force a reconnect.
 *  - HL acks every subscribe on channel `subscriptionResponse`. Subscribing to
 *    a settled or unknown `#` coin does NOT produce an `error` frame — the
 *    server silently closes the whole socket (1006). We track un-acked
 *    subscriptions and evict any that were still pending across two
 *    consecutive closes, so a single poisoned subscription cannot wedge the
 *    client in a reconnect loop.
 *  - `error` frames (e.g. "Already subscribed") are logged in dev.
 */
class HyperliquidWebSocket {
  private ws: WebSocket | null = null
  private subscriptions = new Map<string, Subscription>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000

  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private lastMessageAt = 0
  private static readonly PING_MS = 30_000
  private static readonly STALE_MS = 75_000

  /** subscription key → consecutive socket closes observed while un-acked */
  private pending = new Map<string, number>()
  private static readonly EVICT_AFTER_CLOSES = 2
  /** subscribe keys in the order they were sent on the *current* socket */
  private sentOrder: string[] = []

  private static key(s: WsSubscription): string {
    return JSON.stringify(s)
  }

  connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return // CONNECTING | OPEN

    const ws = new WebSocket(WS_URL)
    this.ws = ws

    let opened = false
    ws.onopen = () => {
      opened = true
      this.reconnectDelay = 1000
      this.lastMessageAt = Date.now()
      this.sentOrder = []
      this.startKeepAlive(ws)
      // Re-send healthy subscriptions first, then any that were still un-acked
      // when the previous socket closed — one at a time with spacing, so the
      // healthy ones are acked before a poisoned subscribe can kill the socket.
      const suspects: [string, WsSubscription][] = []
      for (const [id, sub] of this.subscriptions) {
        const n = this.pending.get(HyperliquidWebSocket.key(sub.subscription)) ?? 0
        if (n > 0) suspects.push([id, sub.subscription])
        else this.sendSubscribe(sub.subscription)
      }
      suspects.forEach(([id, sub], i) => {
        setTimeout(() => {
          if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return
          // Skip if unsubscribed (or replaced) while we were waiting.
          if (this.subscriptions.get(id)?.subscription !== sub) return
          this.sendSubscribe(sub)
        }, 250 * (i + 1))
      })
    }

    ws.onmessage = (event) => {
      this.lastMessageAt = Date.now()
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.channel === 'pong') return
        if (msg.channel === 'subscriptionResponse') {
          const sub = msg.data?.subscription
          if (msg.data?.method === 'subscribe' && sub) this.onAck(sub)
          return
        }
        if (msg.channel === 'error') {
          if (import.meta.env.DEV) console.warn('[hl-ws] server error:', msg.data)
          return
        }
        if (msg.channel && msg.data) {
          this.dispatch(msg.channel, msg.data)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      if (this.ws !== ws) return // superseded by a newer socket
      this.stopKeepAlive()
      this.ws = null
      // HL processes subscribes sequentially and closes on the first bad one,
      // so only the EARLIEST un-acked subscribe sent on this socket is the
      // culprit — later ones were simply never processed. (A socket that never
      // opened is a network failure, not a rejection.)
      if (opened) {
        const culprit = this.sentOrder.find((k) => this.pending.has(k))
        if (culprit !== undefined) {
          const n = (this.pending.get(culprit) ?? 0) + 1
          if (n >= HyperliquidWebSocket.EVICT_AFTER_CLOSES) {
            this.evict(culprit)
            this.pending.delete(culprit)
          } else {
            this.pending.set(culprit, n)
          }
        }
      }
      this.sentOrder = []
      this.scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  private startKeepAlive(ws: WebSocket) {
    this.stopKeepAlive()
    this.keepAliveTimer = setInterval(() => {
      if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.lastMessageAt > HyperliquidWebSocket.STALE_MS) {
        // Half-open socket (mobile background, NAT timeout): force a reconnect.
        ws.close()
        return
      }
      ws.send(JSON.stringify({ method: 'ping' }))
    }, HyperliquidWebSocket.PING_MS)
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect()
    }, this.reconnectDelay)
  }

  private sendSubscribe(subscription: WsSubscription) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const k = HyperliquidWebSocket.key(subscription)
      if (!this.pending.has(k)) this.pending.set(k, 0)
      this.sentOrder.push(k)
      this.ws.send(JSON.stringify({ method: 'subscribe', subscription }))
    }
  }

  private sendUnsubscribe(subscription: WsSubscription) {
    this.pending.delete(HyperliquidWebSocket.key(subscription))
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription }))
    }
  }

  /**
   * The server echoes a *normalized* subscription — it adds fields
   * (l2Book: nSigFigs/mantissa/fast), lowercases `user`, and even renames
   * params (spotState: isPortfolioMargin → ignorePortfolioMargin). So an ack
   * is matched on the identity keys only: type, coin, user (case-insensitive).
   */
  private onAck(acked: Record<string, unknown>) {
    const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v)
    for (const k of this.pending.keys()) {
      const sent = JSON.parse(k) as WsSubscription
      if (
        acked.type === sent.type &&
        norm(acked.coin) === norm(sent.coin) &&
        norm(acked.user) === norm(sent.user)
      ) {
        this.pending.delete(k)
      }
    }
  }

  private evict(key: string) {
    for (const [id, sub] of this.subscriptions) {
      if (HyperliquidWebSocket.key(sub.subscription) === key) {
        if (import.meta.env.DEV) {
          console.warn('[hl-ws] evicting subscription never acked by server:', key)
        }
        this.subscriptions.delete(id)
      }
    }
  }

  private dispatch(channel: string, data: unknown) {
    const payload = data as Record<string, unknown> | undefined
    for (const [, sub] of this.subscriptions) {
      if (this.channelMatches(channel, payload, sub.subscription)) {
        sub.handler(data)
      }
    }
  }

  private channelMatches(
    channel: string,
    data: Record<string, unknown> | undefined,
    subscription: WsSubscription
  ): boolean {
    if (channel !== subscription.type) return false

    // For coin-specific channels, also match the coin field (array payloads
    // such as `trades` carry it on each element)
    if (subscription.coin && data) {
      const dataCoin = Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)?.coin
        : (data as Record<string, unknown>).coin
      if (dataCoin && dataCoin !== subscription.coin) return false
    }

    // For user-specific channels, match user field (case-insensitive — HL lowercases addresses)
    if (subscription.user && data) {
      const dataUser = (data as Record<string, unknown>).user as string | undefined
      if (dataUser && dataUser.toLowerCase() !== subscription.user.toLowerCase()) return false
    }

    return true
  }

  subscribe(id: string, subscription: WsSubscription, handler: MessageHandler) {
    // Skip if already subscribed with the same ID (prevents redundant WS messages)
    if (this.subscriptions.has(id)) return
    this.subscriptions.set(id, { subscription, handler })
    this.sendSubscribe(subscription)
  }

  unsubscribe(id: string) {
    const sub = this.subscriptions.get(id)
    if (sub) {
      this.sendUnsubscribe(sub.subscription)
      this.subscriptions.delete(id)
    }
  }

  isSubscribed(id: string): boolean {
    return this.subscriptions.has(id)
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopKeepAlive()
    this.subscriptions.clear()
    this.pending.clear()
    const ws = this.ws
    this.ws = null
    ws?.close()
  }
}

export const hlWebSocket = new HyperliquidWebSocket()

// Connect eagerly — the singleton manages its own reconnection.
// No React component should call connect()/disconnect().
hlWebSocket.connect()
