import { useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { IS_TESTNET, DEV_MODE } from '@/config'
import { getDevSigner } from '@/lib/devWallet'
import { orderToWire, buildOrderAction, signL1Action } from '@/lib/hyperliquid/signing'
import { signWithdraw3 } from '@/lib/hyperliquid/signing'
import { postExchange } from '@/lib/hyperliquid/api'
import toast from 'react-hot-toast'

const BRIDGE_ADDRESS = IS_TESTNET
  ? '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89'
  : '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7'

const USDH_FAUCET_URL = 'https://app.hyperliquid-testnet.xyz/drip'

const WITHDRAW_SIGNATURE_CHAIN_ID = IS_TESTNET ? '0x66eee' : '0xa4b1'

/** Look up the USDH/USDC spot pair index from spotMeta. */
function findSwapPairAssetId(
  spotMeta: { universe: { tokens: [number, number]; name: string; index: number }[]; tokens: { name: string; index: number }[] } | null
): number | null {
  if (!spotMeta) return null
  const tokenNameMap = new Map<number, string>()
  for (const t of spotMeta.tokens) tokenNameMap.set(t.index, t.name)
  for (const pair of spotMeta.universe) {
    const base = tokenNameMap.get(pair.tokens[0]) ?? ''
    const quote = tokenNameMap.get(pair.tokens[1]) ?? ''
    if (
      (base === 'USDH' && quote === 'USDC') ||
      (base === 'USDC' && quote === 'USDH')
    ) {
      return 10000 + pair.index
    }
  }
  return null
}

type Tab = 'deposit' | 'withdraw'

export function DepositModal({ onClose, initialTab = 'deposit' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)

  // Deposit swap state
  const [swapAmount, setSwapAmount] = useState('')
  const [swapping, setSwapping] = useState(false)

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [showWithdrawSwap, setShowWithdrawSwap] = useState(false)
  const [withdrawSwapAmount, setWithdrawSwapAmount] = useState('')
  const [withdrawSwapping, setWithdrawSwapping] = useState(false)

  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const spotBalances = usePortfolioStore((s) => s.spotBalances)
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio)
  const quoteCoin = useMarketStore((s) => s.outcomeQuoteCoin) || 'USDC'
  const spotMeta = useMarketStore((s) => s.spotMeta)

  const quoteBalance = spotBalances[quoteCoin] ?? 0
  const usdcBalance = spotBalances['USDC'] ?? 0
  const needsSwap = quoteCoin !== 'USDC'
  const swapPairAssetId = findSwapPairAssetId(spotMeta)
  const swapAvailable = !!swapPairAssetId

  function getSigner() {
    return walletClient ?? (DEV_MODE ? getDevSigner() : null)
  }

  function copyBridge() {
    navigator.clipboard.writeText(BRIDGE_ADDRESS)
    toast.success('Bridge address copied')
  }

  // --- Swap: USDC → quoteCoin (buy) ---
  async function handleSwapBuy() {
    const amt = parseFloat(swapAmount)
    if (!amt || amt <= 0) return toast.error('Enter an amount to swap')
    if (amt > usdcBalance) return toast.error('Insufficient USDC balance')
    const signer = getSigner()
    if (!signer || !address) return toast.error('Wallet not connected')
    if (!swapPairAssetId) return toast.error('Swap pair not found')

    setSwapping(true)
    try {
      const order = orderToWire(swapPairAssetId, true, 1.01, amt, false, 'Ioc')
      const action = buildOrderAction([order])
      const nonce = Date.now()
      const sig = await signL1Action(signer, action, nonce)
      await postExchange({ action, nonce, signature: sig })
      toast.success(`Swapped ${amt} USDC → ${quoteCoin}`)
      if (address) fetchPortfolio(address)
      setSwapAmount('')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setSwapping(false)
    }
  }

  // --- Swap: quoteCoin → USDC (sell) ---
  async function handleSwapSell() {
    const amt = parseFloat(withdrawSwapAmount)
    if (!amt || amt <= 0) return toast.error('Enter an amount to swap')
    if (amt > quoteBalance) return toast.error(`Insufficient ${quoteCoin} balance`)
    const signer = getSigner()
    if (!signer || !address) return toast.error('Wallet not connected')
    if (!swapPairAssetId) return toast.error('Swap pair not found')

    setWithdrawSwapping(true)
    try {
      const order = orderToWire(swapPairAssetId, false, 0.99, amt, false, 'Ioc')
      const action = buildOrderAction([order])
      const nonce = Date.now()
      const sig = await signL1Action(signer, action, nonce)
      await postExchange({ action, nonce, signature: sig })
      toast.success(`Swapped ${amt} ${quoteCoin} → USDC`)
      if (address) fetchPortfolio(address)
      setWithdrawSwapAmount('')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setWithdrawSwapping(false)
    }
  }

  // --- Withdraw USDC to Arbitrum ---
  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmount)
    if (!amt || amt <= 0) return toast.error('Enter an amount')
    if (amt > usdcBalance) return toast.error('Insufficient USDC balance')
    const signer = getSigner()
    if (!signer || !address) return toast.error('Wallet not connected')

    setWithdrawing(true)
    try {
      const nonce = Date.now()
      const amountStr = amt.toFixed(2)
      const sig = await signWithdraw3(signer, address, amountStr, nonce)

      await postExchange({
        action: {
          type: 'withdraw3',
          hyperliquidChain: IS_TESTNET ? 'Testnet' : 'Mainnet',
          signatureChainId: WITHDRAW_SIGNATURE_CHAIN_ID,
          destination: address,
          amount: amountStr,
          time: nonce,
        },
        nonce,
        signature: sig,
      })

      toast.success(`Withdrawing ${amountStr} USDC to ${address.slice(0, 6)}...`)
      if (address) fetchPortfolio(address)
      setWithdrawAmount('')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-surface-0 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('deposit')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'deposit' ? 'text-white bg-surface-2' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => setTab('withdraw')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === 'withdraw' ? 'text-white bg-surface-2' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Withdraw
            </button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="p-5 overflow-y-auto">
          {tab === 'deposit' ? (
            /* ===================== DEPOSIT TAB ===================== */
            <div className="space-y-4">
              {/* Balance overview */}
              <div>
                <div className="text-xs text-gray-500 uppercase font-mono mb-1">Current Balance</div>
                <div className="text-2xl font-bold text-gray-100">
                  {quoteBalance.toFixed(2)} {quoteCoin}
                </div>
                {needsSwap && usdcBalance > 0 && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    + {usdcBalance.toFixed(2)} USDC
                  </div>
                )}
              </div>

              {/* Bridge */}
              <div className="card p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-200">Send USDC on Arbitrum</div>
                <p className="text-xs text-gray-400">
                  Transfer USDC to the Hyperliquid bridge address below. Minimum 5 USDC. Credited in ~1 minute.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-amber-400 bg-surface-2 px-3 py-2 rounded-lg font-mono truncate">
                    {BRIDGE_ADDRESS}
                  </code>
                  <button
                    onClick={copyBridge}
                    className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Testnet faucet */}
              {IS_TESTNET && needsSwap && (
                <a
                  href={USDH_FAUCET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between card p-3 hover:border-amber-500/20 transition-colors group"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-200 group-hover:text-amber-400 transition-colors">
                      {quoteCoin} Testnet Faucet
                    </div>
                    <div className="text-xs text-gray-500">Get free testnet {quoteCoin} tokens</div>
                  </div>
                  <svg className="w-4 h-4 text-gray-500 group-hover:text-amber-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}

              {/* Swap USDC → quoteCoin */}
              {needsSwap && (
                <SwapCard
                  title={`Swap USDC → ${quoteCoin}`}
                  description={`Markets on Verity settle in ${quoteCoin}. Swap your USDC to start trading.`}
                  fromLabel="USDC"
                  fromBalance={usdcBalance}
                  toLabel={quoteCoin}
                  amount={swapAmount}
                  onAmountChange={setSwapAmount}
                  onMax={() => setSwapAmount(String(usdcBalance))}
                  onSwap={handleSwapBuy}
                  swapping={swapping}
                  disabled={!isConnected}
                  swapAvailable={swapAvailable}
                  testnetMessage={IS_TESTNET && !swapAvailable ? `Testnet ${quoteCoin} market not available` : undefined}
                />
              )}
            </div>
          ) : (
            /* ===================== WITHDRAW TAB ===================== */
            <div className="space-y-4">
              {/* Balance overview — show USDC first, then quoteCoin */}
              <div>
                <div className="text-xs text-gray-500 uppercase font-mono mb-1">Available</div>
                <div className="text-2xl font-bold text-gray-100">
                  {usdcBalance.toFixed(2)} USDC
                </div>
                {needsSwap && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    + {quoteBalance.toFixed(2)} {quoteCoin}
                  </div>
                )}
              </div>

              {/* Swap quoteCoin → USDC (collapsible) */}
              {needsSwap && (
                <div className="card overflow-hidden">
                  <button
                    onClick={() => setShowWithdrawSwap(!showWithdrawSwap)}
                    className="flex items-center justify-between w-full px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-gray-200">
                      Swap {quoteCoin} → USDC
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${showWithdrawSwap ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showWithdrawSwap && (
                    <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                      <p className="text-xs text-gray-400">
                        Convert your {quoteCoin} back to USDC before withdrawing.
                      </p>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-gray-500 uppercase font-mono">{quoteCoin} Amount</label>
                          <span className="text-[10px] text-gray-500 font-mono">Bal: {quoteBalance.toFixed(2)}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            value={withdrawSwapAmount}
                            onChange={(e) => setWithdrawSwapAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
                          />
                          <button
                            onClick={() => setWithdrawSwapAmount(String(quoteBalance))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </div>
                      </div>

                      <div className="bg-surface-1 rounded-lg px-4 py-2.5">
                        <div className="text-[10px] text-gray-500 uppercase font-mono mb-0.5">You receive (approx.)</div>
                        <div className="text-sm font-semibold text-gray-200">
                          ~{withdrawSwapAmount ? parseFloat(withdrawSwapAmount).toFixed(2) : '0.00'} USDC
                        </div>
                      </div>

                      <button
                        onClick={handleSwapSell}
                        disabled={withdrawSwapping || !withdrawSwapAmount || parseFloat(withdrawSwapAmount) <= 0 || !isConnected || !swapAvailable}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!swapAvailable && IS_TESTNET
                          ? `Testnet ${quoteCoin} market not available`
                          : withdrawSwapping
                            ? 'Swapping...'
                            : 'Swap to USDC'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Withdraw inputs in card */}
              <div className="card p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-200">
                  Withdraw USDC to Arbitrum
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-gray-500 uppercase font-mono">Amount</label>
                    <span className="text-[10px] text-gray-500 font-mono">Bal: {usdcBalance.toFixed(2)}</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
                    />
                    <button
                      onClick={() => setWithdrawAmount(String(Math.max(0, usdcBalance - 1)))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-mono mb-1 block">Destination</label>
                  <input
                    type="text"
                    value={address ?? ''}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-400 font-mono"
                  />
                </div>

                <p className="text-[10px] text-gray-500">
                  Withdrawal fee: $1. Arrives in ~3–4 minutes.
                </p>

                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !isConnected}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {withdrawing ? 'Signing...' : 'Withdraw USDC'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Reusable Swap Card (used on deposit side)
   ============================================================ */

function SwapCard({
  title,
  description,
  fromLabel,
  fromBalance,
  toLabel,
  amount,
  onAmountChange,
  onMax,
  onSwap,
  swapping,
  disabled,
  swapAvailable,
  testnetMessage,
}: {
  title: string
  description: string
  fromLabel: string
  fromBalance: number
  toLabel: string
  amount: string
  onAmountChange: (v: string) => void
  onMax: () => void
  onSwap: () => void
  swapping: boolean
  disabled: boolean
  swapAvailable: boolean
  testnetMessage?: string
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-200">{title}</div>
      <p className="text-xs text-gray-400">{description}</p>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-gray-500 uppercase font-mono">{fromLabel} Amount</label>
          <span className="text-[10px] text-gray-500 font-mono">Bal: {fromBalance.toFixed(2)}</span>
        </div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
          />
          <button
            onClick={onMax}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
          >
            MAX
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      <div className="bg-surface-1 rounded-lg px-4 py-2.5">
        <div className="text-[10px] text-gray-500 uppercase font-mono mb-0.5">You receive (approx.)</div>
        <div className="text-sm font-semibold text-gray-200">
          ~{amount ? parseFloat(amount).toFixed(2) : '0.00'} {toLabel}
        </div>
      </div>

      <button
        onClick={onSwap}
        disabled={swapping || !amount || parseFloat(amount) <= 0 || disabled || !swapAvailable}
        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!swapAvailable && testnetMessage
          ? testnetMessage
          : swapping
            ? 'Swapping...'
            : `Swap to ${toLabel}`}
      </button>

      {testnetMessage && !swapAvailable && (
        <p className="text-[10px] text-gray-500 text-center">Use the faucet above to get testnet {toLabel}.</p>
      )}
    </div>
  )
}
