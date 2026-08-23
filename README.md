# Verity

Decentralized prediction market interface for Hyperliquid HIP-4 outcome markets.

Mainnet: https://verity.eth.limo · Testnet: https://test.verity.eth.limo

## Features

- **Outcome trading** — Buy/sell Yes/No shares on BTC/ETH/SOL/HYPE daily binaries and price-bucket questions
- **Real-time data** — Live order book, price charts, and trade feed via WebSocket
- **Nostr chat** — Global trollbox + per-market chat, identity derived from wallet
- **Mobile-first** — Responsive design with bottom nav and touch-friendly trading
- **Fully decentralized** — Static site deployable to IPFS, no server required

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS v4
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

Network is selected at build time via `VITE_NETWORK` (`.env.development` → testnet, `.env.production` → mainnet;
`npm run dev:mainnet` / `npm run build:testnet` override). Edit `src/config.ts` to:
- Set `BUILDER_ADDRESS` / `BUILDER_FEE` (builder account must hold ≥100 USDC perps account value in standard abstraction mode)
- Configure Nostr relay URLs

Deploys: push to `master` → testnet (`test.verity.eth`); push a `v*` tag → mainnet (`verity.eth`). Requires `PINATA_JWT`, `ENS_PRIVATE_KEY`, `RPC_URL` secrets.
