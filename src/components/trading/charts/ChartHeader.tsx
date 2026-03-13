interface ChartHeaderProps {
  underlying: string
  targetPrice: number
  currentPrice: number
}

/** Format a number to at least 3 significant figures */
function formatSF(value: number, minSF = 3): string {
  if (value === 0) return '0.00'
  const digits = Math.floor(Math.log10(Math.abs(value))) + 1
  const decimals = Math.max(0, minSF - digits)
  return value.toFixed(decimals)
}

export function ChartHeader({ underlying, targetPrice, currentPrice }: ChartHeaderProps) {
  const delta = currentPrice - targetPrice
  const isAbove = delta >= 0
  const absDelta = Math.abs(delta)
  const pctDelta = targetPrice > 0 ? (absDelta / targetPrice) * 100 : 0

  return (
    <div className="flex items-center gap-6">
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">Price to beat</div>
        <div className="text-lg font-bold text-gray-100">
          ${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      <div className="w-px h-8 bg-white/10" />
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide">
          Current price
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-100">
            ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {currentPrice > 0 && (
            <span className={`text-xs font-semibold ${isAbove ? 'text-yes' : 'text-no'}`}>
              {isAbove ? '\u25B2' : '\u25BC'} ${formatSF(absDelta)} ({pctDelta.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
