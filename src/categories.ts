import type { ParsedMarket } from '@/lib/hyperliquid/types'

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

export interface CategoryDef {
  id: string
  label: string
  /** 'meta' = custom sort/filter logic (Trending, New). 'content' = filter by market properties. */
  type: 'meta' | 'content'
  /** For content categories: auto-match rules (checked in order, first match wins) */
  match?: {
    /** Match market.class values */
    class?: string[]
    /** Match market.underlying */
    underlying?: RegExp
    /** Match market.name or market.description */
    keywords?: RegExp
  }
  /** Show a vertical divider before this category in the nav bar */
  dividerBefore?: boolean
}

// ---------------------------------------------------------------------------
// Categories — add/reorder/remove here to update the entire app
// ---------------------------------------------------------------------------

export const categories: CategoryDef[] = [
  // Meta categories (sort/filter logic lives in MarketList)
  { id: 'trending', label: 'Trending', type: 'meta' },
  { id: 'new', label: 'New', type: 'meta' },

  // Content categories — matched by auto-rules + manual overrides
  {
    id: 'sports',
    label: 'Sports',
    type: 'content',
    dividerBefore: true,
    match: {
      class: ['sports'],
      keywords: /race|game|match|tournament|championship|win\b|vs\b/i,
    },
  },
  {
    id: 'crypto',
    label: 'Crypto',
    type: 'content',
    match: {
      class: ['crypto', 'priceBinary'],
      underlying: /^(BTC|ETH|SOL|HYPE|DOGE|XRP|ADA|DOT|AVAX|MATIC|LINK|UNI|AAVE|OP|ARB|SUI|APT|SEI|TIA|JUP|WIF|BONK|PEPE)/i,
    },
  },
]

// ---------------------------------------------------------------------------
// Manual overrides: outcomeId → category id
// These take priority over auto-rules.
// ---------------------------------------------------------------------------

export const manualCategoryMap: Record<number, string> = {
  9: 'sports',
}

// ---------------------------------------------------------------------------
// Categorization logic
// ---------------------------------------------------------------------------

export function getMarketCategory(market: ParsedMarket): string {
  const manual = manualCategoryMap[market.outcomeId]
  if (manual) return manual

  for (const cat of categories) {
    if (cat.type !== 'content' || !cat.match) continue

    if (cat.match.class?.includes(market.class)) return cat.id
    if (cat.match.underlying?.test(market.underlying)) return cat.id
    if (cat.match.keywords?.test(market.name)) return cat.id
  }

  return 'uncategorized'
}

/** Get the list of category IDs */
export function getCategoryIds(): string[] {
  return categories.map((c) => c.id)
}

/** Lookup a category definition by ID */
export function getCategoryDef(id: string): CategoryDef | undefined {
  return categories.find((c) => c.id === id)
}
