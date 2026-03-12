/** Encode outcome ID + side into the combined encoding */
export function encodeOutcome(outcomeId: number, side: number): number {
  return 10 * outcomeId + side
}

/** Get the coin format used in L2 book, trades, allMids */
export function toCoin(outcomeId: number, side: number): string {
  return `#${encodeOutcome(outcomeId, side)}`
}

/** Get the token format used in balances, feeToken */
export function toToken(outcomeId: number, side: number): string {
  return `+${encodeOutcome(outcomeId, side)}`
}

/** Get the asset ID used in order wire format */
export function toAssetId(outcomeId: number, side: number): number {
  return 100_000_000 + encodeOutcome(outcomeId, side)
}

/** Parse a coin string (#8890) back to outcomeId and side */
export function parseCoin(coin: string): { outcomeId: number; side: number } | null {
  if (!coin.startsWith('#')) return null
  const encoding = parseInt(coin.slice(1), 10)
  if (isNaN(encoding)) return null
  return {
    outcomeId: Math.floor(encoding / 10),
    side: encoding % 10,
  }
}

/** Parse a token string (+8890) back to outcomeId and side */
export function parseToken(token: string): { outcomeId: number; side: number } | null {
  if (!token.startsWith('+')) return null
  const encoding = parseInt(token.slice(1), 10)
  if (isNaN(encoding)) return null
  return {
    outcomeId: Math.floor(encoding / 10),
    side: encoding % 10,
  }
}

/** Parse an asset ID (100008890) back to outcomeId and side */
export function parseAssetId(assetId: number): { outcomeId: number; side: number } | null {
  if (assetId < 100_000_000) return null
  const encoding = assetId - 100_000_000
  return {
    outcomeId: Math.floor(encoding / 10),
    side: encoding % 10,
  }
}
