import { useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import toast from 'react-hot-toast'
import type { ParsedMarket } from '@/lib/hyperliquid/types'
import { useMarketStore } from '@/stores/marketStore'
import { orderToWire, buildOrderAction, signL1Action } from '@/lib/hyperliquid/signing'
import { postExchange, fetchMaxBuilderFee } from '@/lib/hyperliquid/api'
import { signApproveBuilderFee } from '@/lib/hyperliquid/signing'
import { BUILDER_ADDRESS, BUILDER_FEE, IS_TESTNET } from '@/config'

type Side = 'yes' | 'no'

export function TradeForm({ market }: { market: ParsedMarket }) {
  const [side, setSide] = useState<Side>('yes')
  const [price, setPrice] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const getYesPrice = useMarketStore((s) => s.getYesPrice)
  const getNoPrice = useMarketStore((s) => s.getNoPrice)

  const currentPrice = side === 'yes' ? getYesPrice(market) : getNoPrice(market)
  const priceNum = price ? parseFloat(price) / 100 : currentPrice
  const amountNum = amount ? parseFloat(amount) : 0
  const cost = priceNum * amountNum
  const potentialReturn = amountNum - cost

  const assetId = side === 'yes' ? market.yesAssetId : market.noAssetId

  async function ensureBuilderFeeApproved() {
    if (!address || !walletClient) return

    try {
      const maxFee = await fetchMaxBuilderFee(address, BUILDER_ADDRESS)
      if (maxFee >= BUILDER_FEE) return // Already approved
    } catch {
      // If query fails, try to approve anyway
    }

    // Need to approve builder fee
    const nonce = Date.now()
    const sig = await signApproveBuilderFee(
      walletClient,
      BUILDER_ADDRESS as `0x${string}`,
      '0.01%',
      nonce
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
    if (!isConnected || !walletClient || !address) {
      toast.error('Connect your wallet first')
      return
    }
    if (!priceNum || !amountNum) {
      toast.error('Enter price and amount')
      return
    }

    setSubmitting(true)
    try {
      // Ensure builder fee is approved
      await ensureBuilderFeeApproved()

      const order = orderToWire(assetId, true, priceNum, amountNum)
      const action = buildOrderAction([order], {
        b: BUILDER_ADDRESS,
        f: BUILDER_FEE,
      })

      const nonce = Date.now()
      const sig = await signL1Action(walletClient, action, nonce)

      await postExchange({
        action,
        nonce,
        signature: sig,
      })

      toast.success('Order placed!')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Trade</h3>

      {/* Side selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setSide('yes')}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            side === 'yes'
              ? 'bg-yes/20 text-yes border border-yes/30 shadow-lg shadow-yes/5'
              : 'bg-surface-2 text-gray-400 border border-white/5 hover:text-gray-200'
          }`}
        >
          {market.sideNames[0]} {Math.round(getYesPrice(market) * 100)}¢
        </button>
        <button
          onClick={() => setSide('no')}
          className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
            side === 'no'
              ? 'bg-no/20 text-no border border-no/30 shadow-lg shadow-no/5'
              : 'bg-surface-2 text-gray-400 border border-white/5 hover:text-gray-200'
          }`}
        >
          {market.sideNames[1]} {Math.round(getNoPrice(market) * 100)}¢
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Price input */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Limit Price (¢)
          </label>
          <div className="relative">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={String(Math.round(currentPrice * 100))}
              className="input w-full pr-8"
              min="1"
              max="99"
              step="1"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              ¢
            </span>
          </div>
        </div>

        {/* Amount input */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Shares
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="input w-full"
            min="1"
            step="1"
          />
        </div>

        {/* Cost summary */}
        {amountNum > 0 && (
          <div className="bg-surface-2 rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Cost</span>
              <span className="text-gray-200 font-mono">
                ${cost.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Potential return</span>
              <span className="text-yes font-mono">
                +${potentialReturn.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">ROI if correct</span>
              <span className="text-yes font-mono">
                {cost > 0 ? `+${((potentialReturn / cost) * 100).toFixed(0)}%` : '-'}
              </span>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !isConnected}
          className={`w-full py-3 rounded-lg text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'yes'
              ? 'bg-yes hover:bg-yes/90 text-white'
              : 'bg-no hover:bg-no/90 text-white'
          }`}
        >
          {!isConnected
            ? 'Connect Wallet'
            : submitting
              ? 'Confirming...'
              : `Buy ${side === 'yes' ? market.sideNames[0] : market.sideNames[1]}`}
        </button>
      </form>
    </div>
  )
}
