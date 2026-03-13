import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { DEV_MODE } from './config'
import App from './App'
import './index.css'

// In dev mode, inject a local wallet before React mounts
if (DEV_MODE) {
  const { injectDevWallet } = await import('./lib/devWallet')
  injectDevWallet()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
