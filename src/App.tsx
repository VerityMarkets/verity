import { Routes, Route } from 'react-router-dom'
import { WagmiProvider, http } from 'wagmi'
import { arbitrum, arbitrumSepolia } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  darkTheme,
  getDefaultConfig,
} from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { Toaster } from 'react-hot-toast'

import { IS_TESTNET } from './config'
import { AppShell } from './components/layout/AppShell'
import { HomePage } from './pages/HomePage'
import { MarketPage } from './pages/MarketPage'
import { PortfolioPage } from './pages/PortfolioPage'

const config = getDefaultConfig({
  appName: 'Verity',
  projectId: 'verity-prediction-markets',
  chains: IS_TESTNET ? [arbitrumSepolia] : [arbitrum],
  transports: IS_TESTNET
    ? { [arbitrumSepolia.id]: http() }
    : { [arbitrum.id]: http() },
})

const queryClient = new QueryClient()

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
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/market/:id" element={<MarketPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
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
