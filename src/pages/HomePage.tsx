import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMarketStore } from '@/stores/marketStore'
import { MarketList } from '@/components/markets/MarketList'
import { Trollbox } from '@/components/chat/Trollbox'

export function HomePage() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('cat') || 'trending'
  const fetchMarkets = useMarketStore((s) => s.fetchMarkets)

  // Refresh markets on every navigation to the home page
  useEffect(() => {
    fetchMarkets()
  }, [fetchMarkets])

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <MarketList category={category} />
      </div>

      {/* Global Trollbox — right sidebar, hidden on mobile */}
      <div className="hidden lg:block w-72 shrink-0">
        {/* <main> is the scroll container, so sticky offsets are measured
            from its top edge: match the content padding (py-4). */}
        <Trollbox
          className="sticky top-4"
          style={{ height: 'calc(100vh - 3.625rem - 2rem)' }}
        />
      </div>
    </div>
  )
}
