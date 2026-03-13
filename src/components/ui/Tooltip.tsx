import type { ReactNode } from 'react'

/**
 * Instant CSS-only tooltip (no delay like native title attribute).
 * Uses Tailwind group-hover for zero-delay display.
 */
export function Tooltip({
  text,
  children,
  className = '',
  align = 'left',
}: {
  text: string
  children: ReactNode
  className?: string
  /** Horizontal alignment relative to the trigger element */
  align?: 'left' | 'center' | 'right'
}) {
  const alignClass =
    align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : align === 'right'
        ? 'right-0'
        : 'left-0'

  return (
    <span className={`relative group inline-flex ${className}`}>
      {children}
      <span
        className={`absolute ${alignClass} bottom-full mb-1.5 hidden group-hover:block whitespace-nowrap text-[10px] text-gray-200 bg-surface-3 border border-white/10 rounded px-2 py-1 z-50 pointer-events-none shadow-lg`}
      >
        {text}
      </span>
    </span>
  )
}
