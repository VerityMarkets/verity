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
  if (market.class === 'priceBucket') {
    // Bucket label is already baked into `name`; append the expiry like binaries.
    const expiryDate = parseExpiry(market.expiry)
    if (!expiryDate) return market.name
    const dateStr = expiryDate
      .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/\bam\b/i, 'AM')
      .replace(/\bpm\b/i, 'PM')
    return `${market.name} on ${dateStr}`
  }
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
 * Format a 0–1 probability as cents for display (not for orderbook aggregation).
 *
 * Picks just enough precision to never show a misleading "0" (for any non-zero
 * price) or "100" (for any sub-100% price). Uses whole cents in the comfortable
 * 1–99¢ range; falls back to fractional precision near the edges.
 *
 *   1.00       → "100"
 *   0.99       → "99"
 *   0.995      → "99.5"
 *   0.9999     → "99.99"
 *   0.50       → "50"
 *   0.01       → "1"
 *   0.005      → "0.5"
 *   0.0001     → "0.01"
 *   ≤ 0        → "0"
 */
export function formatPriceCents(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '0'
  if (price >= 1) return '100'
  const cents = price * 100

  // Mid-range — integer cents (rounded). Bounds chosen so rounding can never
  // produce 0 or 100 here.
  if (cents >= 1 && cents < 99.5) return Math.round(cents).toString()

  // Sub-1¢ — show enough decimals to be non-zero
  if (cents < 1) {
    return cents >= 0.1 ? cents.toFixed(1) : cents.toFixed(2)
  }

  // Above 99.5¢ — fractional approaching 100, never hitting it (use floor)
  if (cents <= 99.9) return cents.toFixed(1)
  return (Math.floor(cents * 100) / 100).toFixed(2)
}

/**
 * Format a 0–1 price as cents for a single-sided fill display (e.g. the YES/NO
 * buy buttons in TradeForm). Rounds in the direction that makes the displayed
 * price a valid sweep target:
 *
 *   side='ceil'  → buy / ask (display ≥ actual; placing a bid at it crosses)
 *   side='floor' → sell / bid (display ≤ actual; placing an ask at it crosses)
 *
 * Auto-picks tick size by magnitude: 1¢ in the 1–99 range, 0.1¢ when sub-1¢ or
 * just under 100¢, 0.01¢ for the extremes. Trailing zeros preserved at tick.
 *
 * Returned string is also a valid limit-price input value (decimal cents).
 */
export function formatFillCents(price: number, side: 'ceil' | 'floor'): string {
  if (!Number.isFinite(price) || price <= 0) return side === 'ceil' ? '0.01' : '0'
  if (price >= 1) return '100'
  const cents = price * 100
  const round = side === 'ceil' ? Math.ceil : Math.floor

  // Choose tick: 1¢ in the comfortable mid-range, finer near the edges
  let tickInv: 1 | 10 | 100
  if (cents >= 1 && cents <= 99) tickInv = 1
  else if (cents >= 0.1 && cents <= 99.9) tickInv = 10
  else tickInv = 100

  const tickCents = round(cents * tickInv) / tickInv

  // Boundary safety
  if (tickCents <= 0) {
    // Bid floored to 0 — show actual price at sub-tick precision so it's valid
    return cents.toFixed(3)
  }
  if (tickCents >= 100) return '100'

  const decimals = tickInv === 1 ? 0 : tickInv === 10 ? 1 : 2
  return tickCents.toFixed(decimals)
}

/**
 * Convert a user-entered cents string (e.g. "49.5", "0.008", "99.99") to the
 * HL wire price string in [0,1] using decimal string arithmetic — no float
 * artifacts like 0.49000000000000005 — and validate HL's price rules for
 * outcome assets: > 0, < 1, at most 5 significant figures, at most 8 decimals.
 *
 * Returns `{ px }` on success or `{ error }` with a user-facing message.
 */
export function centsToWirePrice(cents: string): { px: string } | { error: string } {
  const trimmed = cents.trim()
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') {
    return { error: 'Enter a valid price' }
  }
  const [intPartRaw, fracPartRaw = ''] = trimmed.split('.')
  const intPart = intPartRaw || '0'
  // cents → probability: shift the decimal point two places left
  let digits = intPart + fracPartRaw // all digits
  let pointPos = intPart.length - 2 // index in `digits` where the point goes
  if (pointPos < 0) {
    digits = '0'.repeat(-pointPos) + digits
    pointPos = 0
  }
  let whole = digits.slice(0, pointPos) || '0'
  let frac = digits.slice(pointPos).replace(/0+$/, '')
  whole = whole.replace(/^0+(?=\d)/, '')
  const px = frac ? `${whole}.${frac}` : whole
  const value = parseFloat(px)
  if (!(value > 0)) return { error: 'Price must be above 0¢' }
  if (value >= 1) return { error: 'Price must be below 100¢' }
  if (frac.length > 8) return { error: 'Price has too many decimals (max 0.000001¢)' }
  const sigFigs = (whole.replace(/^0+/, '') + frac).replace(/^0+/, '').length
  if (sigFigs > 5) return { error: 'Price may have at most 5 significant figures' }
  return { px }
}

/**
 * Format a share count for compact display.
 * e.g. 854 → "854", 1600 → "1.6k", 12300 → "12.3k"
 */
export function formatShares(count: number): string {
  const floored = Math.floor(count)
  if (floored < 1000) return String(floored)
  const k = floored / 1000
  return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
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
