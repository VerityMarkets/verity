import { useSearchParams } from 'react-router-dom'
import { MarketList } from '@/components/markets/MarketList'
import { Trollbox } from '@/components/chat/Trollbox'

export function HomePage() {
  const [searchParams] = useSearchParams()
  const category = searchParams.get('cat') || 'trending'

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
