import { useState, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { usePortfolioStore } from '@/stores/portfolioStore'
import { useMarketStore } from '@/stores/marketStore'
import { IS_TESTNET, DEV_MODE, SIGNATURE_CHAIN_ID_HEX, HYPERLIQUID_CHAIN } from '@/config'
import { getDevSigner, devWalletInjected } from '@/lib/devWallet'
import {
  orderToWire,
  buildOrderAction,
  signL1Action,
  signWithdraw3,
  signUsdClassTransfer,
  nextNonce,
} from '@/lib/hyperliquid/signing'
import { postExchange } from '@/lib/hyperliquid/api'
import toast from 'react-hot-toast'

const BRIDGE_ADDRESS = IS_TESTNET
  ? '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89'
  : '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7'

const USDH_FAUCET_URL = 'https://app.hyperliquid-testnet.xyz/drip'

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

/** Floor to 6 dp via the decimal string: spot USDC balances carry 8 dp but
 *  usdClassTransfer is posted at 6 dp, and toFixed(6) can round ABOVE the
 *  balance (string-based so 8.2 does not become 8.199999). */
function floor6(x: number): number {
  const [i, d = ''] = x.toFixed(8).split('.')
  return parseFloat(`${i}.${d.slice(0, 6)}`)
}

type Tab = 'deposit' | 'withdraw'

export function DepositModal({ onClose, initialTab = 'deposit' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)

  // Deposit swap state
  const [showDepositSwap, setShowDepositSwap] = useState(false)
  const [swapAmount, setSwapAmount] = useState('')
  const [swapping, setSwapping] = useState(false)

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [showWithdrawSwap, setShowWithdrawSwap] = useState(false)
  const [withdrawSwapAmount, setWithdrawSwapAmount] = useState('')
  const [withdrawSwapping, setWithdrawSwapping] = useState(false)

  // Perps ↔ spot transfer state
  const [transferAmount, setTransferAmount] = useState('')
  const [transferring, setTransferring] = useState(false)

  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const spotAvailable = usePortfolioStore((s) => s.spotAvailable)
  const perpsWithdrawable = usePortfolioStore((s) => s.perpsWithdrawable)
  const abstraction = usePortfolioStore((s) => s.abstraction)
  const refreshPerpsState = usePortfolioStore((s) => s.refreshPerpsState)
  const quoteCoin = useMarketStore((s) => s.outcomeQuoteCoin) || 'USDC'
  const spotMeta = useMarketStore((s) => s.spotMeta)

  // Available (net of holds) — what can actually be swapped / transferred / withdrawn
  const quoteBalance = spotAvailable[quoteCoin] ?? 0
  const usdcBalance = spotAvailable['USDC'] ?? 0
  const needsSwap = quoteCoin !== 'USDC'
  const swapPairAssetId = findSwapPairAssetId(spotMeta)
  const swapAvailable = !!swapPairAssetId

  // Arbitrum bridge deposits credit the *perps* clearinghouse; outcome markets
  // trade spot USDC; withdraw3 debits perps. In the unified/portfolio-margin
  // abstraction modes these are one balance; otherwise the user must move USDC
  // with usdClassTransfer. Unknown mode (REST failed) → show the transfer UI
  // whenever a perps balance is visible.
  const modeKnown = abstraction !== null
  const unified = abstraction === 'unifiedAccount' || abstraction === 'portfolioMargin'
  const separated = modeKnown && !unified

  // Poll while open: a bridge deposit lands in ~1 min and the perps side is
  // REST-only (spot arrives via the spotState WS).
  useEffect(() => {
    refreshPerpsState()
    const timer = setInterval(refreshPerpsState, 10_000)
    return () => clearInterval(timer)
  }, [refreshPerpsState])

  function getSigner() {
    return walletClient ?? (DEV_MODE && devWalletInjected ? getDevSigner() : null)
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
      const nonce = nextNonce()
      const sig = await signL1Action(signer, action, nonce)
      await postExchange({ action, nonce, signature: sig })
      toast.success(`Swapped ${amt} USDC → ${quoteCoin}`)

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
      const nonce = nextNonce()
      const sig = await signL1Action(signer, action, nonce)
      await postExchange({ action, nonce, signature: sig })
      toast.success(`Swapped ${amt} ${quoteCoin} → USDC`)

      setWithdrawSwapAmount('')
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setWithdrawSwapping(false)
    }
  }

  // --- usdClassTransfer: move USDC between perps and spot (user-signed) ---
  async function handleClassTransfer(toPerp: boolean) {
    const amt = floor6(parseFloat(transferAmount) || 0)
    if (!amt || amt <= 0) return toast.error('Enter an amount')
    const max = toPerp ? usdcBalance : perpsWithdrawable
    if (amt > max + 1e-9) return toast.error(`Insufficient ${toPerp ? 'spot' : 'perps'} USDC`)
    const signer = getSigner()
    if (!signer || !address) return toast.error('Wallet not connected')

    setTransferring(true)
    try {
      const nonce = nextNonce()
      const amountStr = amt.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
      const sig = await signUsdClassTransfer(signer, amountStr, toPerp, nonce)
      await postExchange({
        action: {
          type: 'usdClassTransfer',
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID_HEX,
          amount: amountStr,
          toPerp,
          nonce,
        },
        nonce,
        signature: sig,
      })
      toast.success(`Moved ${amountStr} USDC to ${toPerp ? 'perps' : 'trading'} balance`)
      setTransferAmount('')
      // spot balance arrives via spotState WS; perps side is REST
      setTimeout(() => refreshPerpsState(), 1500)
    } catch (err) {
      toast.error((err as Error).message.slice(0, 80))
    } finally {
      setTransferring(false)
    }
  }

  // --- Withdraw USDC to Arbitrum (debits the perps balance) ---
  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmount)
    if (!amt || amt <= 0) return toast.error('Enter an amount')
    if (!modeKnown) {
      refreshPerpsState()
      return toast.error('Still loading your account mode — try again in a moment')
    }
    const withdrawMax = separated ? perpsWithdrawable : usdcBalance
    if (amt > withdrawMax + 1e-9) {
      return toast.error(separated ? 'Move USDC to your perps balance first' : 'Insufficient USDC balance')
    }
    const signer = getSigner()
    if (!signer || !address) return toast.error('Wallet not connected')

    setWithdrawing(true)
    try {
      const nonce = nextNonce()
      const amountStr = amt.toFixed(2)
      const sig = await signWithdraw3(signer, address, amountStr, nonce)

      await postExchange({
        action: {
          type: 'withdraw3',
          hyperliquidChain: HYPERLIQUID_CHAIN,
          signatureChainId: SIGNATURE_CHAIN_ID_HEX,
          destination: address,
          amount: amountStr,
          time: nonce,
        },
        nonce,
        signature: sig,
      })
      setTimeout(() => refreshPerpsState(), 1500)

      toast.success(`Withdrawing ${amountStr} USDC to ${address.slice(0, 6)}...`)

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
                <div className="text-xs text-gray-500 uppercase font-mono mb-1">Trading Balance</div>
                <div className="text-2xl font-bold text-gray-100">
                  {quoteBalance.toFixed(2)} {quoteCoin}
                </div>
                {needsSwap && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    + {usdcBalance.toFixed(2)} USDC
                  </div>
                )}
                {separated && perpsWithdrawable > 0 && (
                  <div className="text-sm text-amber-400/80 mt-0.5">
                    + {perpsWithdrawable.toFixed(2)} USDC in perps balance
                  </div>
                )}
              </div>

              {/* Perps → trading (spot) transfer — bridge deposits land in perps */}
              {separated && perpsWithdrawable > 0 && (
                <div className="card p-4 space-y-3 border-amber-500/20">
                  <div className="text-sm font-semibold text-gray-200">Move USDC to trading balance</div>
                  <p className="text-xs text-gray-400">
                    Bridge deposits arrive in your Hyperliquid <span className="text-gray-300">perps</span> balance.
                    Prediction markets trade from your <span className="text-gray-300">spot</span> balance — move funds across to start trading.
                  </p>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-gray-500 uppercase font-mono">Amount</label>
                      <span className="text-[10px] text-gray-500 font-mono">Perps: {perpsWithdrawable.toFixed(2)}</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
                      />
                      <button
                        onClick={() => setTransferAmount(String(floor6(perpsWithdrawable)))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleClassTransfer(false)}
                    disabled={transferring || !transferAmount || parseFloat(transferAmount) <= 0 || !isConnected}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {transferring ? 'Signing...' : 'Move to trading balance'}
                  </button>
                </div>
              )}

              {/* Bridge */}
              <div className="card p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-200">Send USDC on Arbitrum</div>
                <p className="text-xs text-gray-400">
                  Transfer USDC to the Hyperliquid bridge address below. Minimum 5 USDC. Credited in ~1 minute
                  {separated ? ' to your perps balance — then move it to trading above.' : '.'}
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

              {/* Swap USDC → quoteCoin (collapsible) */}
              {needsSwap && (
                <div className="card overflow-hidden">
                  <button
                    onClick={() => setShowDepositSwap(!showDepositSwap)}
                    className="flex items-center justify-between w-full px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-gray-200">
                      Swap USDC → {quoteCoin}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${showDepositSwap ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showDepositSwap && (
                    <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                      <p className="text-xs text-gray-400">
                        Markets on Verity settle in {quoteCoin}. Swap your USDC to start trading.
                      </p>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] text-gray-500 uppercase font-mono">USDC Amount</label>
                          <span className="text-[10px] text-gray-500 font-mono">Bal: {usdcBalance.toFixed(2)}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            value={swapAmount}
                            onChange={(e) => setSwapAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
                          />
                          <button
                            onClick={() => setSwapAmount(String(usdcBalance))}
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
                          ~{swapAmount ? parseFloat(swapAmount).toFixed(2) : '0.00'} {quoteCoin}
                        </div>
                      </div>

                      <button
                        onClick={handleSwapBuy}
                        disabled={swapping || !swapAmount || parseFloat(swapAmount) <= 0 || !isConnected || !swapAvailable}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!swapAvailable && IS_TESTNET
                          ? `Testnet ${quoteCoin} market not available`
                          : swapping
                            ? 'Swapping...'
                            : `Swap to ${quoteCoin}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ===================== WITHDRAW TAB ===================== */
            <div className="space-y-4">
              {/* Balance overview */}
              <div>
                <div className="text-xs text-gray-500 uppercase font-mono mb-1">
                  {separated ? 'Withdrawable (perps balance)' : 'Available'}
                </div>
                <div className="text-2xl font-bold text-gray-100">
                  {(separated ? perpsWithdrawable : usdcBalance).toFixed(2)} USDC
                </div>
                {separated && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    + {usdcBalance.toFixed(2)} USDC in trading balance
                  </div>
                )}
                {needsSwap && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    + {quoteBalance.toFixed(2)} {quoteCoin}
                  </div>
                )}
              </div>

              {/* Trading (spot) → perps transfer — withdrawals debit perps */}
              {separated && usdcBalance > 0 && (
                <div className="card p-4 space-y-3">
                  <div className="text-sm font-semibold text-gray-200">Move USDC to perps balance</div>
                  <p className="text-xs text-gray-400">
                    Withdrawals to Arbitrum are taken from your perps balance. Move trading-balance USDC across first.
                  </p>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-gray-500 uppercase font-mono">Amount</label>
                      <span className="text-[10px] text-gray-500 font-mono">Trading: {usdcBalance.toFixed(2)}</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-2.5 rounded-lg bg-surface-1 border border-white/5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/30 pr-16"
                      />
                      <button
                        onClick={() => setTransferAmount(String(floor6(usdcBalance)))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleClassTransfer(true)}
                    disabled={transferring || !transferAmount || parseFloat(transferAmount) <= 0 || !isConnected}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold bg-surface-3 hover:bg-surface-4 text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {transferring ? 'Signing...' : 'Move to perps balance'}
                  </button>
                </div>
              )}

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
                    <span className="text-[10px] text-gray-500 font-mono">
                      Bal: {(separated ? perpsWithdrawable : usdcBalance).toFixed(2)}
                    </span>
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
                      onClick={() => setWithdrawAmount(String(Math.max(0, (separated ? perpsWithdrawable : usdcBalance) - 1)))}
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
                  disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || !isConnected || !modeKnown}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {!modeKnown ? 'Loading account...' : withdrawing ? 'Signing...' : 'Withdraw USDC'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

