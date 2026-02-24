# Aurum — Convert Dust USDC to Gold

Dust conversion for Solana USDC to tokenized Gold.  
Built with Oro’s GRAIL API.

Aurum allows users to deposit dust USDC — small, idle amounts sitting in their wallets — which are batched daily and converted into tokenized gold, distributed proportionally back to users.

---

## What It Does

Users deposit small amounts of USDC. The system aggregates these deposits and converts them into GOLD once per day.

### Flow

1. User queues their dust USDC
2. Daily job aggregates all pending dust
3. Buy GOLD with USDC (via GRAIL)
4. Custodial partner signs and submits transaction
5. Distribute gold proportionally to users

## 🏗 Architecture

The system is divided into three main parts:

---

### 1. Frontend Flow

<img width="540" height="324" alt="image" src="https://github.com/user-attachments/assets/9c085884-73cc-470a-bde4-4cda39d8c892" />


Handles all user interactions.

**Services**

- **Auth Service**  
  Wallet connection and verification.

- **Dust Queue Service**  
  Adds user USDC to the conversion queue.

- **Balance Service**  
  Fetches user GOLD holdings.

All services read/write state to PostgreSQL.

---

### 2. Batch Converter (Core Logic)

<img width="1112" height="368" alt="image" src="https://github.com/user-attachments/assets/fff285d6-8ebc-4773-ba0d-7ead3655afae" />


Runs once daily at **00:00 UTC**.

**Steps**

1. Fetch all pending dust from Postgres
2. Aggregate USDC deposits
3. Purchase GOLD using USDC (GRAIL)
4. Calculate proportional user shares
5. Update user balances in Postgres

---

### 3. System Overview

High-level flow:

<img width="469" height="440" alt="image" src="https://github.com/user-attachments/assets/f6d2fe57-b4ab-4e14-81ec-d5521d743872" />

- Frontend calls Backend API  
- Backend triggers Daily Batch Job  
- Batch Job interacts with:
  - GRAIL (USDC → GOLD)
  - Solana RPC (transaction confirmations)
- All application state lives in PostgreSQL

---

Think of it as:

> **“Turn forgotten USDC dust into GOLD — automatically.”**

---

## Backend Ops

- Daily batch schedule runs at **00:00 UTC** in the backend process.
- Disable scheduler locally with `ENABLE_BATCH_CRON=false`.
- Manual trigger endpoint: `POST /api/admin/batch/run` with header `x-admin-key: <ADMIN_API_KEY>`.

### Useful scripts (`backend/`)

- `bun run batch` - run batch conversion once
- `bun run test:batch` - run batch converter tests (empty, happy, failure)
- `bun run test:registration` - test GRAIL user registration flow
- `bun run test:purchase` - test GRAIL purchase flow

## Deposit Settlement Flow (USDC)

Use these endpoints to enforce real USDC deposits before queueing:

1. `POST /api/deposits/create-intent`
2. User sends USDC on devnet to `TREASURY_WALLET_ADDRESS`
3. `POST /api/deposits/confirm` with the transfer `txSignature`
4. Backend verifies on-chain transfer and queues dust

Direct `POST /api/dust/queue` is disabled by default.  
Enable only for local unsafe testing with `ALLOW_UNVERIFIED_DUST_QUEUE=true`.

Required backend env vars:

- `TREASURY_WALLET_ADDRESS` - partner treasury wallet receiving USDC
- `USDC_MINT` - optional; defaults to devnet USDC mint
- `DEPOSIT_INTENT_EXPIRY_MINUTES` - optional; default `30`
