# Aurum

Aurum is a self-custody Solana app that converts USDC into tokenized gold using Oro/Grail APIs.

The current PoC includes:
- Wallet auth with Privy
- Self-custody purchase intent and submit flow
- On-chain balance display (USDC and gold token accounts)
- Optional auto-sweep settings and backend sweep cron scaffolding

## Monorepo Structure

- `app/` - Next.js frontend
- `lib/` - shared frontend libraries (API client, providers, state)
- `backend/` - Express + TypeScript backend
- `backend/supabase/migrations/` - SQL migrations

## Runtime Flow (Self-Custody)

1. User connects wallet in frontend.
2. Frontend calls backend `POST /api/self/purchase-intent`.
3. Backend creates Grail purchase intent and stores trade in `self_custody_trades`.
4. Frontend signs serialized transaction in wallet.
5. Frontend sends signed payload to backend `POST /api/self/purchase-submit`.
6. Backend submits to Grail transaction endpoint and marks trade completed.

## Auto Sweep (Current PoC)

Backend now has:
- `dust_sweep_settings` table
- `dust_sweep_runs` table
- Endpoints:
  - `GET /api/dust/sweep/settings`
  - `POST /api/dust/sweep/settings`
  - `GET /api/dust/sweep/runs`
- Optional cron worker (`ENABLE_DUST_SWEEP_CRON=true`) that creates self-custody intents when thresholds are met.

Frontend currently includes:
- Auto Sweep toggle and basic settings popup in dashboard.

## Local Development

### Frontend

From repo root:

```bash
bun run dev
```

Default: `http://localhost:3000`

### Backend

From `backend/`:

```bash
bun run dev
```

Default: `http://localhost:3001`

## Required Environment Variables

## Frontend (`.env` in repo root)

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_USDC_MINT`
- `NEXT_PUBLIC_GOLD_MINT`
- `NEXT_PUBLIC_SOLANA_EXPLORER_CLUSTER`

## Backend (`backend/.env`)

Core:
- `DATABASE_URL`
- `SOLANA_RPC_URL`
- `GRAIL_API_URL`
- `GRAIL_API_KEY`
- `SPONSOR_PRIVATE_KEY`
- `PURCHASE_OPERATING_MODE` (`self_custody` recommended)

Server/deploy:
- `PORT`
- `CORS_ORIGINS` (comma-separated exact origins)
- `ADMIN_API_KEY`

Optional:
- `ENABLE_BATCH_CRON`
- `ENABLE_DUST_SWEEP_CRON`
- `DUST_SWEEP_INTERVAL_SECONDS`
- `DUST_SWEEP_USDC_MINT`
- `ALLOW_UNVERIFIED_DUST_QUEUE`
- `DEPOSIT_INTENT_EXPIRY_MINUTES`
- `TREASURY_WALLET_ADDRESS`
- `USDC_MINT`
- `GRAIL_HTTP_TIMEOUT_MS`
- `TX_CONFIRM_TIMEOUT_MS`

## Scripts

### Root

- `bun run dev` - start Next.js
- `bun run build` - build Next.js

### Backend (`backend/`)

- `bun run dev` - start API server
- `bun run build` - compile backend
- `bun run batch` - run batch converter once
- `bun run test:registration` - test Grail registration script
- `bun run test:purchase` - test purchase script
- `bun run test:batch` - test batch script

## Deployment Notes

## Frontend (Vercel)

Set frontend envs in Vercel exactly as listed above, especially:
- `NEXT_PUBLIC_API_BASE_URL` must point to deployed backend URL, not localhost.

## Backend (Render)

Set backend envs in Render and ensure:
- `CORS_ORIGINS` includes your Vercel production domain (and preview domains if needed).
- Service and DB point to the same environment you tested locally.

If browser console shows `net::ERR_FAILED` and backend logs show `Not allowed by CORS`, fix `CORS_ORIGINS` first.

## Security

- Do not commit real secrets in `.env` files.
- Rotate any key that has ever been exposed in logs, screenshots, or committed history.
