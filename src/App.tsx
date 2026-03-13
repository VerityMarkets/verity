import { useEffect, useRef } from 'react'
import { Routes, Route } from 'react-router-dom'
import { WagmiProvider, http, useConnect, useAccount } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { arbitrum, arbitrumSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { Toaster } from 'react-hot-toast'

import { IS_TESTNET, DEV_MODE } from './config'
import { devWalletInjected } from './lib/devWallet'
import { usePortfolioStore } from './stores/portfolioStore'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './pages/HomePage'
import { MarketPage } from './pages/MarketPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { AboutPage } from './pages/AboutPage'

const config = getDefaultConfig({
  appName: 'Verity',
  projectId: 'verity-prediction-markets',
  chains: IS_TESTNET ? [arbitrumSepolia] : [arbitrum],
  transports: IS_TESTNET
    ? { [arbitrumSepolia.id]: http() }
    : { [arbitrum.id]: http() },
})

const queryClient = new QueryClient()

/**
 * In dev mode, auto-connect the injected dev wallet once on mount.
 * Only fires when the dev wallet was actually injected (no real extension present).
 */
function DevAutoConnect() {
  const { connect } = useConnect()
  const { isConnected } = useAccount()
  const tried = useRef(false)

  useEffect(() => {
    if (!DEV_MODE || !devWalletInjected || isConnected || tried.current) return
    tried.current = true
    connect({ connector: injected({ target: 'metaMask' }) })
  }, [connect, isConnected])

  return null
}

/** Subscribe to portfolio updates once when wallet connects. */
function PortfolioSync() {
  const { address } = useAccount()
  const fetchPortfolio = usePortfolioStore((s) => s.fetchPortfolio)
  const subscribePortfolio = usePortfolioStore((s) => s.subscribePortfolio)
  const unsubscribePortfolio = usePortfolioStore((s) => s.unsubscribePortfolio)

  useEffect(() => {
    if (!address) return
    fetchPortfolio(address)
    subscribePortfolio(address)
    const interval = setInterval(() => fetchPortfolio(address), 15_000)
    return () => {
      clearInterval(interval)
      unsubscribePortfolio()
    }
  }, [address])

  return null
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#f59e0b',
            accentColorForeground: '#0a0a0b',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
        >
          {DEV_MODE && <DevAutoConnect />}
          <PortfolioSync />
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/market/:id" element={<MarketPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/about" element={<AboutPage />} />
            </Routes>
          </AppShell>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#1a1a1e',
                color: '#f3f4f6',
                border: '1px solid rgba(255,255,255,0.06)',
              },
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
