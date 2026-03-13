import { useMemo } from 'react'

/**
 * Deterministic color avatar from a hex string (pubkey/address).
 * Renders a 3x3 symmetric pixel grid — similar to GitHub identicons.
 */
export function Hashicon({ value, size = 18 }: { value: string; size?: number }) {
  const { colors, pixels } = useMemo(() => {
    // Parse first 12 bytes of the hex string as seed
    const hex = value.replace(/^0x/, '').slice(0, 24).padEnd(24, '0')
    const bytes: number[] = []
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.slice(i, i + 2), 16))
    }

    // Pick two colors from the seed
    const hue1 = (bytes[0] * 360) / 256
    const hue2 = (hue1 + 120 + (bytes[1] % 120)) % 360
    const fg = `hsl(${hue1}, 65%, 55%)`
    const bg = `hsl(${hue2}, 30%, 20%)`

    // Generate a 3x3 symmetric grid (only need left half + center)
    const grid: boolean[][] = []
    for (let row = 0; row < 3; row++) {
      const r: boolean[] = []
      for (let col = 0; col < 3; col++) {
        const mirroredCol = col > 1 ? 2 - col : col // mirror for symmetry
        const byteIdx = 2 + row * 2 + mirroredCol
        r.push(bytes[byteIdx] % 2 === 0)
      }
      grid.push(r)
    }

    return { colors: { fg, bg }, pixels: grid }
  }, [value])

  const cellSize = size / 3

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-sm shrink-0"
      style={{ background: colors.bg }}
    >
      {pixels.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={colors.fg}
            />
          ) : null
        )
      )}
    </svg>
  )
}
