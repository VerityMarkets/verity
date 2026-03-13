import type { ParsedMarket } from '@/lib/hyperliquid/types'

export interface ChatGroup {
  /** Nostr tag value, e.g. "bo:BTC:15m" or "986" */
  key: string
  /** Display label, e.g. "BTC 15m" or "HL 100m dash" */
  label: string
}

/**
 * Derive chat group for a market.
 * Recurring binary options (with underlying + period) group by underlying:period
 * so all BTC 15m markets share one continuous chat room.
 * Non-recurring markets keep their specific outcome ID.
 */
export function getChatGroup(market: ParsedMarket): ChatGroup {
  if (market.underlying && market.period) {
    return {
      key: `bo:${market.underlying}:${market.period}`,
      label: `${market.underlying} ${market.period}`,
    }
  }
  return {
    key: String(market.outcomeId),
    label: market.underlying || market.name,
  }
}

/** Parse a chat group key back into a display label. */
export function chatGroupLabel(key: string): string {
  if (key.startsWith('bo:')) {
    const [, underlying, period] = key.split(':')
    return `${underlying} ${period}`
  }
  return `#${key}`
}

/** Check if a key is a group key (vs a specific market ID). */
export function isGroupKey(key: string): boolean {
  return key.startsWith('bo:')
}

/**
 * Find the latest active market matching a group key.
 * Returns the outcomeId to link to, or null if none found.
 */
export function findMarketForGroup(key: string, markets: ParsedMarket[]): number | null {
  if (!key.startsWith('bo:')) return null
  const [, underlying, period] = key.split(':')
  const matching = markets.filter(
    (m) => m.underlying === underlying && m.period === period
  )
  if (matching.length === 0) return null
  // Latest expiry first
  matching.sort((a, b) => b.expiry.localeCompare(a.expiry))
  return matching[0].outcomeId
}
