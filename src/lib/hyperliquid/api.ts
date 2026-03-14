import { API_URL } from '@/config'
import type {
  OutcomeMeta,
  AllMids,
  SpotMeta,
  L2Book,
  Trade,
  Candle,
  SpotClearinghouseState,
  OpenOrder,
  Fill,
} from './types'

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json() as Promise<T>
}

export async function postExchange(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_URL}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Exchange error: ${res.status} - ${text}`)
  }
  const data = await res.json()

  // Hyperliquid returns { status: "ok" | "err", response: ... }
  if (data.status === 'err') {
    throw new Error(data.response || 'Unknown exchange error')
  }

  // For order responses, check individual order statuses
  if (data.response?.type === 'order' && data.response?.data?.statuses) {
    const statuses = data.response.data.statuses
    for (const s of statuses) {
      if (s.error) {
        throw new Error(s.error)
      }
    }
  }

  return data
}

export function fetchOutcomeMeta(): Promise<OutcomeMeta> {
  return postInfo<OutcomeMeta>({ type: 'outcomeMeta' })
}

export function fetchSpotMeta(): Promise<SpotMeta> {
  return postInfo<SpotMeta>({ type: 'spotMeta' })
}

export function fetchAllMids(): Promise<AllMids> {
  return postInfo<AllMids>({ type: 'allMids' })
}

export function fetchL2Book(coin: string): Promise<L2Book> {
  return postInfo<L2Book>({ type: 'l2Book', coin })
}

export function fetchRecentTrades(coin: string): Promise<Trade[]> {
  return postInfo<Trade[]>({ type: 'recentTrades', coin })
}

export function fetchCandles(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Candle[]> {
  return postInfo<Candle[]>({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  })
}

export function fetchSpotState(user: string): Promise<SpotClearinghouseState> {
  return postInfo<SpotClearinghouseState>({
    type: 'spotClearinghouseState',
    user,
  })
}

export function fetchOpenOrders(user: string): Promise<OpenOrder[]> {
  return postInfo<OpenOrder[]>({ type: 'frontendOpenOrders', user })
}

export function fetchUserFills(user: string): Promise<Fill[]> {
  return postInfo<Fill[]>({ type: 'userFills', user })
}

export function fetchExtraAgents(
  user: string
): Promise<{ name: string; address: string; validUntil: number }[]> {
  return postInfo<{ name: string; address: string; validUntil: number }[]>({
    type: 'extraAgents',
    user,
  })
}

export function fetchMaxBuilderFee(
  user: string,
  builder: string
): Promise<number> {
  return postInfo<number>({ type: 'maxBuilderFee', user, builder })
}
