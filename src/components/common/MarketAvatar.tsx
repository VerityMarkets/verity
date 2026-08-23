/**
 * Avatar for a market or a series.
 *
 * Price markets on a real underlying keep their coin logo; everything else gets
 * a muted glyph that says what *kind* of market it is (which sport, policy,
 * price) instead of a random-coloured lettermark. All inline SVG — the app
 * ships to IPFS and cannot fetch icons.
 */
import type { ReactNode } from 'react'
import { CoinLogo } from './CoinLogo'

const RING = '#27282c' // surface-2
const INK = '#9aa2af'

/** Sub-category (the deployer's `sport` keyword) → glyph id. */
const SPORT_GLYPH: Record<string, string> = {
  football: 'soccer',
  soccer: 'soccer',
  futbol: 'soccer',
  'association football': 'soccer',
  basketball: 'basketball',
  nba: 'basketball',
  baseball: 'baseball',
  mlb: 'baseball',
  'american football': 'gridiron',
  'gridiron football': 'gridiron',
  nfl: 'gridiron',
  hockey: 'hockey',
  'ice hockey': 'hockey',
  nhl: 'hockey',
  tennis: 'tennis',
  racing: 'flag',
  'motor racing': 'flag',
  motorsport: 'flag',
  f1: 'flag',
  'formula 1': 'flag',
  track: 'flag',
  'track and field': 'flag',
  athletics: 'flag',
  running: 'flag',
  marathon: 'flag',
  cycling: 'flag',
}

const stroke = {
  fill: 'none',
  stroke: INK,
  strokeWidth: 5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const GLYPHS: Record<string, ReactNode> = {
  soccer: (
    <g {...stroke}>
      <circle cx="50" cy="50" r="25" />
      <path d="M50 35 63 44.5 58 60H42L37 44.5z" fill={INK} stroke="none" />
      <path d="M50 35V26M63 44.5l8.5-3M58 60l5.5 7.5M42 60l-5.5 7.5M37 44.5l-8.5-3" />
    </g>
  ),
  basketball: (
    <g {...stroke}>
      <circle cx="50" cy="50" r="25" />
      <path d="M50 25v50M25 50h50" />
      <path d="M33 32c8.5 8 8.5 28 0 36M67 32c-8.5 8-8.5 28 0 36" />
    </g>
  ),
  baseball: (
    <g {...stroke}>
      <circle cx="50" cy="50" r="25" />
      <path d="M34 32c7 9.5 7 26.5 0 36M66 32c-7 9.5-7 26.5 0 36" />
      <path d="M39 41h-5M39 50h-5M39 59h-5M61 41h5M61 50h5M61 59h5" strokeWidth="3.5" />
    </g>
  ),
  gridiron: (
    <g {...stroke}>
      <ellipse cx="50" cy="50" rx="29" ry="18" transform="rotate(-20 50 50)" />
      <path d="M39 54 61 46" />
      <path d="M44 45.5l2.5 5M50 43.5l2.5 5M56 41.5l2.5 5" strokeWidth="3.5" />
    </g>
  ),
  hockey: (
    <g {...stroke}>
      <path d="M68 26 44 62" />
      <path d="M44 62h16" />
      <ellipse cx="34" cy="68" rx="12" ry="6" />
    </g>
  ),
  tennis: (
    <g {...stroke}>
      <ellipse cx="45" cy="42" rx="16" ry="20" transform="rotate(-35 45 42)" />
      <path d="M57 59 71 76" />
      <path d="M36 30 55 51M52 28 40 54" strokeWidth="3" />
    </g>
  ),
  flag: (
    <g {...stroke}>
      <path d="M31 24v54" />
      <path d="M31 29h40v25H31z" />
      <g fill={INK} stroke="none">
        <rect x="31" y="29" width="13.3" height="12.5" />
        <rect x="57.6" y="29" width="13.4" height="12.5" />
        <rect x="44.3" y="41.5" width="13.3" height="12.5" />
      </g>
    </g>
  ),
  trophy: (
    <g {...stroke}>
      <path d="M36 26h28v13c0 8-6.3 14-14 14s-14-6-14-14z" />
      <path d="M36 31h-8c0 7 3.5 11 8.5 11.5M64 31h8c0 7-3.5 11-8.5 11.5" />
      <path d="M50 53v11M40 76h20l-2.5-12h-15z" />
    </g>
  ),
  bank: (
    <g {...stroke}>
      <path d="M26 44 50 28l24 16" />
      <path d="M35 48v22M50 48v22M65 48v22" />
      <path d="M26 76h48" />
    </g>
  ),
  chart: (
    <g {...stroke}>
      <path d="M27 71 43 53l10 9 21-25" />
      <path d="M62 37h12v12" />
    </g>
  ),
}

function glyphFor(category?: string, subCategory?: string): ReactNode | null {
  if (category === 'sports') {
    const id = subCategory ? SPORT_GLYPH[subCategory.toLowerCase()] : undefined
    return GLYPHS[id ?? 'trophy']
  }
  if (category === 'economics') return GLYPHS.bank
  if (category === 'price') return GLYPHS.chart
  return null
}

export interface MarketAvatarProps {
  /** Underlying ticker (BTC/ETH/…); when set the coin logo wins. */
  symbol?: string
  category?: string
  subCategory?: string
  /** Text the lettermark falls back to (the market/series title). */
  label?: string
  size?: number
  className?: string
}

export function MarketAvatar({
  symbol,
  category,
  subCategory,
  label = '',
  size = 32,
  className = '',
}: MarketAvatarProps) {
  if (symbol) return <CoinLogo symbol={symbol} size={size} className={className} />

  const glyph = glyphFor(category, subCategory)
  const title = [category, subCategory].filter(Boolean).join(' · ') || label

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={title || 'market'}
    >
      <title>{title || 'market'}</title>
      <circle cx="50" cy="50" r="50" fill={RING} />
      {glyph ?? (
        <text
          x="50"
          y="64"
          textAnchor="middle"
          fontSize="42"
          fontWeight="700"
          fontFamily="Arial, Helvetica, sans-serif"
          fill={INK}
        >
          {label.trim().slice(0, 1).toUpperCase() || '?'}
        </text>
      )}
    </svg>
  )
}
