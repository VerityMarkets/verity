# Verity

Decentralized prediction market interface for Hyperliquid HIP-4 outcome markets.

## Features

- **Binary outcome trading** — Buy/sell Yes/No shares on BTC and HYPE price predictions
- **Real-time data** — Live order book, price charts, and trade feed via WebSocket
- **Nostr chat** — Global trollbox + per-market chat, identity derived from wallet
- **Mobile-first** — Responsive design with bottom nav and touch-friendly trading
- **Fully decentralized** — Static site deployable to IPFS, no server required

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS v4 (dark theme, amber/gold accent)
- wagmi v2 + viem + RainbowKit
- Zustand, lightweight-charts, nostr-tools
- @msgpack/msgpack for Hyperliquid signing

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs a static bundle to `dist/` ready for IPFS deployment.

## Configuration

Edit `src/config.ts` to:
- Toggle `IS_TESTNET` between testnet and mainnet
- Set `BUILDER_ADDRESS` to your builder fee collection address
- Configure Nostr relay URLs
