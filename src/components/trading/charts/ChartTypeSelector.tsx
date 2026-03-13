export type ChartType = 'probability' | 'ticker' | 'candles'

interface ChartTypeSelectorProps {
  activeType: ChartType
  onSelect: (type: ChartType) => void
  showTicker: boolean
  showCandles: boolean
}

function IconButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'text-amber-400 bg-surface-3'
          : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

export function ChartTypeSelector({
  activeType,
  onSelect,
  showTicker,
  showCandles,
}: ChartTypeSelectorProps) {
  const hasMultiple = showTicker || showCandles
  if (!hasMultiple) return null

  return (
    <div className="flex items-center gap-0.5 justify-end mt-2">
      {/* Probability / line chart */}
      <IconButton
        active={activeType === 'probability'}
        onClick={() => onSelect('probability')}
        title="Probability"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 18l6-8 4 5 8-11" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 4h4v4" />
        </svg>
      </IconButton>

      {/* Real-time ticker / pulse */}
      {showTicker && (
        <IconButton
          active={activeType === 'ticker'}
          onClick={() => onSelect('ticker')}
          title="Live Price"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h4l3-8 3 16 3-8h7" />
          </svg>
        </IconButton>
      )}

      {/* Underlying candles */}
      {showCandles && (
        <IconButton
          active={activeType === 'candles'}
          onClick={() => onSelect('candles')}
          title="Candle Chart"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M5 5v14M3 8h4v7H3z M12 3v18M10 6h4v10h-4z M19 6v12M17 9h4v5h-4z" />
          </svg>
        </IconButton>
      )}
    </div>
  )
}
