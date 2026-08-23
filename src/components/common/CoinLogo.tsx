/**
 * Inline SVG logos for the underlyings HL lists outcome markets on.
 * Self-contained (no remote assets) so they work from IPFS. Unknown symbols
 * fall back to a neutral lettermark.
 */
import type { ReactNode } from 'react'

const LOGOS: Record<string, { bg: string; fg: string; glyph: ReactNode }> = {
  BTC: {
    bg: '#F7931A',
    fg: '#fff',
    glyph: (
      <>
        <text x="50" y="68" textAnchor="middle" fontSize="52" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif" fill="#fff" transform="rotate(-12 50 50)">B</text>
        <g transform="rotate(-12 50 50)" fill="#fff">
          <rect x="40" y="22" width="5" height="10" rx="1" />
          <rect x="51" y="22" width="5" height="10" rx="1" />
          <rect x="40" y="68" width="5" height="10" rx="1" />
          <rect x="51" y="68" width="5" height="10" rx="1" />
        </g>
      </>
    ),
  },
  ETH: {
    bg: '#627EEA',
    fg: '#fff',
    glyph: (
      <g>
        <polygon points="50,14 50,42 74,52" fill="#fff" opacity="0.6" />
        <polygon points="50,14 26,52 50,42" fill="#fff" />
        <polygon points="50,58 50,86 74,57" fill="#fff" opacity="0.6" />
        <polygon points="50,86 50,58 26,57" fill="#fff" />
        <polygon points="50,42 50,52 74,52" fill="#fff" opacity="0.2" />
        <polygon points="50,42 26,52 50,52" fill="#fff" opacity="0.6" />
      </g>
    ),
  },
  SOL: {
    bg: '#000',
    fg: '#fff',
    glyph: (
      <g>
        <polygon points="30,30 72,30 80,22 38,22" fill="#9945FF" />
        <polygon points="30,54 72,54 80,46 38,46" fill="#19FB9B" />
        <polygon points="38,78 80,78 72,70 30,70" fill="#9945FF" />
      </g>
    ),
  },
  HYPE: {
    bg: '#0B1F1C',
    fg: '#97FCE4',
    glyph: (
      <g fill="#97FCE4">
        <rect x="24" y="24" width="14" height="52" rx="7" />
        <rect x="62" y="24" width="14" height="52" rx="7" />
        <path d="M34 50c6-9 12-9 16 0s10 9 16 0v10c-6 9-12 9-16 0s-10-9-16 0z" />
      </g>
    ),
  },
}

const FALLBACK_COLORS = ['#7F77DD', '#1D9E75', '#D85A30', '#378ADD', '#D4537E', '#BA7517']

function hashColor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
}

export function CoinLogo({
  symbol,
  size = 28,
  className = '',
}: {
  symbol: string
  size?: number
  className?: string
}) {
  const sym = (symbol || '').toUpperCase()
  const logo = LOGOS[sym]
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={sym || 'market'}
    >
      <circle cx="50" cy="50" r="50" fill={logo?.bg ?? hashColor(sym)} />
      {logo ? (
        logo.glyph
      ) : (
        <text x="50" y="64" textAnchor="middle" fontSize="44" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif" fill="#fff">
          {sym.slice(0, 1) || '?'}
        </text>
      )}
    </svg>
  )
}
