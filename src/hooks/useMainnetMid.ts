import { useRef, useSyncExternalStore } from 'react'
import { IS_TESTNET, API_URL } from '@/config'
import { useMarketStore } from '@/stores/marketStore'
import type { Candle } from '@/lib/hyperliquid/types'

const MAINNET_API_URL = 'https://api.hyperliquid.xyz'

// ─── Mainnet candle fetch ───────────────────────────────────────────────────────

/**
 * Fetch candle data from mainnet (or current network if already mainnet).
 * Used for underlying asset charts so prices are always accurate.
 */
export async function fetchMainnetCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const url = IS_TESTNET ? MAINNET_API_URL : API_URL
  const res = await fetch(`${url}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }),
  })
  return res.json()
}

// ─── Mainnet WebSocket singleton ────────────────────────────────────────────────
// When running on testnet, underlying spot prices (BTC, ETH, HYPE, …) from the
// testnet feed are usually stale/wrong because the oracle resolves on mainnet
// prices. This module opens a lightweight mainnet WebSocket that only tracks
// allMids so charts and headers can show accurate underlying prices.

const MAINNET_WS_URL = 'wss://api.hyperliquid.xyz/ws'

let mids: Record<string, string> = {}
let listeners = new Set<() => void>()
let ws: WebSocket | null = null
let refCount = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function notify() {
  for (const cb of listeners) cb()
}

function connect() {
  if (ws) return

  ws = new WebSocket(MAINNET_WS_URL)

  ws.onopen = () => {
    ws?.send(JSON.stringify({
      method: 'subscribe',
      subscription: { type: 'allMids' },
    }))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string)
      if (msg.data?.mids) {
        mids = msg.data.mids
        notify()
      }
    } catch {
      // ignore
    }
  }

  ws.onclose = () => {
    ws = null
    if (refCount > 0) {
      reconnectTimer = setTimeout(connect, 2000)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function addRef() {
  refCount++
  if (refCount === 1) connect()
}

function removeRef() {
  refCount--
  if (refCount <= 0) {
    refCount = 0
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  addRef()
  return () => {
    listeners.delete(cb)
    removeRef()
  }
}

function getMid(coin: string): string | undefined {
  return mids[coin]
}

// ─── React hook ─────────────────────────────────────────────────────────────────

/**
 * Returns the mainnet mid price for a coin.
 * When IS_TESTNET is false, falls back to the normal store mids (already mainnet).
 */
export function useMainnetMid(coin: string): string | undefined {
  // On mainnet, just use the existing store
  const storeMid = useMarketStore((s) => s.mids[coin])

  const mainnetMid = useSyncExternalStore(
    subscribe,
    () => getMid(coin),
  )

  if (!IS_TESTNET) return storeMid
  return mainnetMid
}

/**
 * Returns a ref that always has the latest mainnet mid for a coin.
 * Useful for non-reactive reads (e.g. inside setInterval callbacks).
 */
export function useMainnetMidRef(coin: string): React.RefObject<string | undefined> {
  const mid = useMainnetMid(coin)
  const ref = useRef<string | undefined>(mid)
  ref.current = mid
  return ref
}
