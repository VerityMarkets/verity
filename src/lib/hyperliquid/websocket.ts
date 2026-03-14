import { WS_URL } from '@/config'
import type { WsSubscription } from './types'

type MessageHandler = (data: unknown) => void

interface Subscription {
  subscription: WsSubscription
  handler: MessageHandler
}

class HyperliquidWebSocket {
  private ws: WebSocket | null = null
  private subscriptions = new Map<string, Subscription>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      this.reconnectDelay = 1000
      // Resubscribe all active subscriptions
      for (const [, sub] of this.subscriptions) {
        this.sendSubscribe(sub.subscription)
      }
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.channel && msg.data) {
          this.dispatch(msg.channel, msg.data)
        }
      } catch {
        // ignore parse errors
      }
    }

    this.ws.onclose = () => {
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
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
      this.ws.send(JSON.stringify({ method: 'subscribe', subscription }))
    }
  }

  private sendUnsubscribe(subscription: WsSubscription) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription }))
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

    // For coin-specific channels, also match the coin field
    if (subscription.coin && data) {
      const dataCoin = (data as Record<string, unknown>).coin
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

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.subscriptions.clear()
    this.ws?.close()
    this.ws = null
  }
}

export const hlWebSocket = new HyperliquidWebSocket()

// Connect eagerly — the singleton manages its own reconnection.
// No React component should call connect()/disconnect().
hlWebSocket.connect()
