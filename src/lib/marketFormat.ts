import type { ParsedMarket } from '@/lib/hyperliquid/types'

/**
 * Parse an expiry string like "20260315-1100" into a Date (UTC).
 */
export function parseExpiry(expiry: string): Date | null {
  const match = expiry.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`)
}

/**
 * Format a market name for display.
 * Recurring priceBinary markets: "BTC above $72,513 on Mar 15, 11:00 AM"
 * Other markets: market.name as-is.
 */
export function formatMarketName(market: ParsedMarket): string {
  if (market.class === 'priceBinary') {
    const expiryDate = parseExpiry(market.expiry)
    if (expiryDate) {
      const dateStr = expiryDate
        .toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        .replace(/\bam\b/i, 'AM')
        .replace(/\bpm\b/i, 'PM')
      return `${market.underlying} above $${market.targetPrice.toLocaleString()} on ${dateStr}`
    }
    return `${market.underlying} above $${market.targetPrice.toLocaleString()}`
  }
  return market.name
}

/**
 * Format expiry with timezone label for the market header.
 * Returns e.g. "Mar 15, 11:00 AM (UTC-7)"
 */
export function formatExpiryWithTimezone(expiry: string): string | null {
  const date = parseExpiry(expiry)
  if (!date) return null
  const formatted = date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const offsetMin = date.getTimezoneOffset()
  const sign = offsetMin <= 0 ? '+' : '-'
  const absHours = Math.floor(Math.abs(offsetMin) / 60)
  const absMin = Math.abs(offsetMin) % 60
  const utcLabel =
    absMin > 0
      ? `UTC${sign}${absHours}:${String(absMin).padStart(2, '0')}`
      : `UTC${sign}${absHours}`
  return `${formatted.replace(/\bam\b/i, 'AM').replace(/\bpm\b/i, 'PM')} (${utcLabel})`
}
