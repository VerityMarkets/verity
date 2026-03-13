import { useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import toast from 'react-hot-toast'
import type { ParsedMarket } from '@/lib/hyperliquid/types'
import { useMarketStore } from '@/stores/marketStore'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useOrderBookStore } from '@/stores/orderbookStore'
import { orderToWire, buildOrderAction, signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange, fetchMaxBuilderFee } from '@/lib/hyperliquid/api'
import { signApproveBuilderFee } from '@/lib/hyperliquid/signing'
import { BUILDER_ADDRESS, BUILDER_FEE, IS_TESTNET, DEV_MODE } from '@/config'
import { getDevSigner } from '@/lib/devWallet'

type Side = 'yes' | 'no'
type OrderType = 'buy' | 'sell'

const MIN_ORDER_VALUE = 10 // Hyperliquid minimum per order

function getMultiplierStyle(mult: number): string {
  if (mult <= 1.2) return 'bg-white/5 text-gray-400'
  if (mult < 2) return 'bg-yes/10 text-yes/70'
  if (mult < 3) return 'bg-yes/20 text-yes/80'
  if (mult < 5) return 'bg-yes/30 text-yes'
  return 'bg-yes/40 text-yes font-bold'
}

export function TradeForm({ market }: { market: ParsedMarket }) {
  const [orderType, setOrderType] = useState<OrderType>('buy')
  const [price, setPrice] = useState<string>('')
  const [shares, setShares] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const { address, isConnected } = useAccount()
  const { data: walletClient, isLoading: walletClientLoading } = useWalletClient()
  const mids = useMarketStore((s) => s.mids)
  const outcomeQuoteCoin = useMarketStore((s) => s.outcomeQuoteCoin)
  const side = useMarketStore((s) => s.tradeSide)
  const setTradeSide = useMarketStore((s) => s.setTradeSide)
  const getBalance = usePortfolioStore((s) => s.getBalance)
  const balances = usePortfolioStore((s) => s.balances)

  // Subscribe to book data directly so we re-render when books update
  const books = useOrderBookStore((s) => s.books)
  const fetchBook = useOrderBookStore((s) => s.fetchBook)

  // Quote balance from dynamic coin
  const quoteBalance = getBalance(outcomeQuoteCoin)

  // Mid prices from allMids (reactive via mids subscription)
  const yesMid = mids[market.yesCoin] ? parseFloat(mids[market.yesCoin]) : 0.5
  const noMid = mids[market.noCoin] ? parseFloat(mids[market.noCoin]) : 0.5

  // Best fill prices from order book (best ask for buying, best bid for selling)
  const yesBook = books[market.yesCoin]
  const noBook = books[market.noCoin]
  const yesBestAsk = yesBook?.asks?.length ? parseFloat(yesBook.asks[0].px) : 0
  const noBestAsk = noBook?.asks?.length ? parseFloat(noBook.asks[0].px) : 0
  const yesBestBid = yesBook?.bids?.length ? parseFloat(yesBook.bids[0].px) : 0
  const noBestBid = noBook?.bids?.length ? parseFloat(noBook.bids[0].px) : 0

  // Button prices: show best immediate fill price, fallback to mid
  const yesFillPrice = orderType === 'buy'
    ? (yesBestAsk > 0 ? yesBestAsk : yesMid)
    : (yesBestBid > 0 ? yesBestBid : yesMid)
  const noFillPrice = orderType === 'buy'
    ? (noBestAsk > 0 ? noBestAsk : noMid)
    : (noBestBid > 0 ? noBestBid : noMid)

  // Round asks up, bids down so the displayed cent price actually crosses for a fill
  const roundForOrder = orderType === 'buy' ? Math.ceil : Math.floor
  const yesPrice = roundForOrder(yesFillPrice * 100)
  const noPrice = roundForOrder(noFillPrice * 100)
  const midCents = side === 'yes' ? yesPrice : noPrice

  // Price in decimal (0-1)
  const priceCents = price ? parseInt(price, 10) : midCents
  const priceDecimal = priceCents / 100

  // Shares → derived values
  const shareCount = shares ? parseFloat(shares) : 0
  const total = priceDecimal * shareCount
  const toWin = shareCount // Each share pays $1 if correct
  const multiplier = priceDecimal > 0 ? 1 / priceDecimal : 0
  const minShares = priceDecimal > 0 ? Math.ceil(MIN_ORDER_VALUE / priceDecimal) : 0
  const belowMin = shareCount > 0 && total < MIN_ORDER_VALUE

  const assetId = side === 'yes' ? market.yesAssetId : market.noAssetId

  // Position for sell max
  const posCoin = '+' + (side === 'yes' ? market.yesCoin : market.noCoin).slice(1)
  const posBalance = balances.find((b) => b.coin === posCoin)
  const positionShares = posBalance ? parseFloat(posBalance.total) : 0

  function handleMax() {
    if (orderType === 'buy' && quoteBalance > 0 && priceDecimal > 0) {
      setShares(String(Math.floor(quoteBalance / priceDecimal)))
    } else if (orderType === 'sell' && positionShares > 0) {
      setShares(String(Math.floor(positionShares)))
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function ensureBuilderFeeApproved(signer: any) {
    if (!address) return

    try {
      const maxFee = await fetchMaxBuilderFee(address, BUILDER_ADDRESS)
      if (maxFee >= BUILDER_FEE) return // Already approved
    } catch {
      // If query fails, try to approve anyway
    }

    const nonce = Date.now()
    const sig = await signApproveBuilderFee(
      signer,
      BUILDER_ADDRESS as `0x${string}`,
      '0.01%',
      nonce,
    )

    await postExchange({
      action: {
        type: 'approveBuilderFee',
        hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
        signatureChainId: '0x66eee',
        maxFeeRate: '0.01%',
        builder: BUILDER_ADDRESS,
        nonce,
      },
      nonce,
      signature: sig,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const signer = walletClient ?? (DEV_MODE ? getDevSigner() : null)
    if (!isConnected || !address) {
      toast.error('Connect your wallet first')
      return
    }
    if (!signer) {
      toast.error('Wallet client not ready — try again in a moment')
      return
    }
    if (!priceCents || shareCount <= 0) {
      toast.error('Enter price and shares')
      return
    }

    setSubmitting(true)
    try {
      const hasRealBuilder =
        BUILDER_ADDRESS !== '0x0000000000000000000000000000000000000000'
      if (hasRealBuilder) {
        await ensureBuilderFeeApproved(signer)
      }

      const isBuy = orderType === 'buy'
      const order = orderToWire(assetId, isBuy, priceDecimal, shareCount)
      const action = buildOrderAction(
        [order],
        hasRealBuilder ? { b: BUILDER_ADDRESS, f: BUILDER_FEE } : undefined,
      )

      const nonce = Date.now()
      const sig = await signL1Action(signer, action, nonce)

      const result = await postExchange({
        action,
        nonce,
        signature: sig,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statuses = (result as any)?.response?.data?.statuses
      if (statuses?.length) {
        const s = statuses[0]
        if (s.filled) {
          toast.success(`Filled ${s.filled.totalSz} @ ${(parseFloat(s.filled.avgPx) * 100).toFixed(0)}¢`)
        } else if (s.resting) {
          toast.success(`Order resting (oid ${s.resting.oid})`)
        } else {
          toast.success('Order placed!')
        }
      } else {
        toast.success('Order placed!')
      }
      setShares('')

      // Refetch book to reflect the new order (WS may be delayed)
      fetchBook(market.yesCoin)
      fetchBook(market.noCoin)
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    isConnected && !walletClientLoading && !submitting && shareCount > 0 && !belowMin

  return (
    <div className="card p-4">
      {/* Buy/Sell underline tabs */}
      <div className="flex border-b border-white/5 mb-4">
        <button
          type="button"
          onClick={() => setOrderType('buy')}
          className={`flex-1 pb-2 text-sm font-semibold transition-all border-b-2 ${
            orderType === 'buy'
              ? 'text-white border-amber-400'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setOrderType('sell')}
          className={`flex-1 pb-2 text-sm font-semibold transition-all border-b-2 ${
            orderType === 'sell'
              ? 'text-white border-amber-400'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Side selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => { setTradeSide('yes'); setPrice(String(yesPrice)) }}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            side === 'yes'
              ? 'bg-yes/20 text-yes border border-yes/30 shadow-lg shadow-yes/5'
              : 'bg-surface-2 text-gray-400 border border-white/5 hover:text-gray-200'
          }`}
        >
          {market.sideNames[0]} {yesPrice}¢
        </button>
        <button
          onClick={() => { setTradeSide('no'); setPrice(String(noPrice)) }}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            side === 'no'
              ? 'bg-no/20 text-no border border-no/30 shadow-lg shadow-no/5'
              : 'bg-surface-2 text-gray-400 border border-white/5 hover:text-gray-200'
          }`}
        >
          {market.sideNames[1]} {noPrice}¢
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Price input */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Limit Price</label>
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() =>
                setPrice(String(Math.max(1, priceCents - 1)))
              }
              className="absolute left-2 w-6 h-6 flex items-center justify-center rounded bg-surface-3 text-gray-400 hover:text-gray-200 text-sm font-bold z-10"
            >
              −
            </button>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              className="input w-full text-center px-10"
              min="1"
              max="99"
              step="1"
            />
            <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              ¢
            </span>
            <button
              type="button"
              onClick={() =>
                setPrice(String(Math.min(99, priceCents + 1)))
              }
              className="absolute right-2 w-6 h-6 flex items-center justify-center rounded bg-surface-3 text-gray-400 hover:text-gray-200 text-sm font-bold z-10"
            >
              +
            </button>
          </div>
        </div>

        {/* Shares input */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-500">Shares</label>
            <div className="flex items-center gap-2">
              {isConnected && (
                <span className="text-xs text-gray-500">
                  {orderType === 'buy'
                    ? `${quoteBalance.toFixed(2)} ${outcomeQuoteCoin}`
                    : positionShares > 0
                      ? `${positionShares.toFixed(1)} shares`
                      : '0 shares'}
                </span>
              )}
              {isConnected && (
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                >
                  Max
                </button>
              )}
            </div>
          </div>
          <input
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0"
            className="input w-full text-right"
            min="1"
            step="1"
          />
        </div>

        {/* Summary */}
        {shareCount > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Total</span>
              <span className="text-gray-200 font-semibold">
                {total.toFixed(2)} {outcomeQuoteCoin}
              </span>
            </div>
            {orderType === 'buy' ? (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">To win</span>
                  <span className="text-yes font-semibold">
                    {toWin.toFixed(2)} {outcomeQuoteCoin}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Potential</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getMultiplierStyle(multiplier)}`}
                  >
                    {multiplier.toFixed(1)}x
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Proceeds</span>
                <span className="text-gray-200 font-semibold">
                  {total.toFixed(2)} {outcomeQuoteCoin}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 hover:bg-amber-400 text-black"
        >
          {!isConnected
            ? 'Connect Wallet'
            : walletClientLoading
              ? 'Initializing...'
              : submitting
                ? 'Confirming...'
                : belowMin
                  ? `Min ${minShares} shares`
                  : `${orderType === 'buy' ? 'Buy' : 'Sell'} ${side === 'yes' ? market.sideNames[0] : market.sideNames[1]}`}
        </button>
      </form>
    </div>
  )
}
