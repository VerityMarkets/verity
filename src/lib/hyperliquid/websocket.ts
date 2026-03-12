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
    for (const [, sub] of this.subscriptions) {
      if (this.channelMatches(channel, sub.subscription)) {
        sub.handler(data)
      }
    }
  }

  private channelMatches(channel: string, subscription: WsSubscription): boolean {
    // Channel names match subscription types
    if (channel === subscription.type) return true
    // Some channels come as specific names
    if (channel === 'l2Book' && subscription.type === 'l2Book') return true
    if (channel === 'trades' && subscription.type === 'trades') return true
    if (channel === 'bbo' && subscription.type === 'bbo') return true
    if (channel === 'candle' && subscription.type === 'candle') return true
    if (channel === 'allMids' && subscription.type === 'allMids') return true
    if (channel === 'orderUpdates' && subscription.type === 'orderUpdates') return true
    if (channel === 'userFills' && subscription.type === 'userFills') return true
    if (channel === 'spotState' && subscription.type === 'spotState') return true
    return false
  }

  subscribe(id: string, subscription: WsSubscription, handler: MessageHandler) {
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
