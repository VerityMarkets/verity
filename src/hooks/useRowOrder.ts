import { useMemo } from 'react'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { useMarketStore } from '@/stores/marketStore'
import { orderRows, rowOrderKey } from '@/lib/marketDisplay'
import type { SeriesRow } from '@/lib/series'

/**
 * Question members sorted by probability (likeliest first; rows with no quotes
 * last, in their original order).
 *
 * A row's percentage comes from its order book when that is two-sided and from
 * allMids otherwise, so either store can change the order — hence two
 * subscriptions. Both selectors read the same global state during render and so
 * return the same key; the second one exists only so an allMids-only tick still
 * reaches this component.
 *
 * The selectors return the order as a *string*, which means a re-sort that
 * changes nothing costs no render at all.
 */
export function useRowOrder(rows: SeriesRow[], enabled: boolean): SeriesRow[] {
  const byBook = useOrderBookStore((s) =>
    enabled ? rowOrderKey(rows, s.books, useMarketStore.getState().mids) : '',
  )
  const byMid = useMarketStore((s) =>
    enabled ? rowOrderKey(rows, useOrderBookStore.getState().books, s.mids) : '',
  )
  const key = byMid || byBook
  return useMemo(() => (enabled ? orderRows(rows, key) : rows), [rows, key, enabled])
}
