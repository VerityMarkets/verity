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
        <Trollbox
          className="sticky top-[4.5rem]"
          style={{ height: 'calc(100vh - 6rem)' }}
        />
      </div>
    </div>
  )
}
