# Aurum — Convert Dust SOL to Gold

Dust conversion for Solana to tokenized Gold.  
Built with Oro’s GRAIL API.

Aurum allows users to deposit dust — small, idle amounts sitting in their wallets — which are batched daily and converted into tokenized gold, distributed proportionally back to users.

---

## What It Does

Users deposit small amounts of SOL. The system aggregates these deposits and converts them into GOLD once per day.

### Flow

1. User queues their dust SOL
2. Daily job aggregates all pending dust
3. Swap SOL → USDC (via Jupiter)
4. Buy GOLD with USDC (via GRAIL)
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
  Adds user SOL to the conversion queue.

- **Balance Service**  
  Fetches user GOLD holdings.

All services read/write state to PostgreSQL.

---

### 2. Batch Converter (Core Logic)

<img width="1112" height="368" alt="image" src="https://github.com/user-attachments/assets/fff285d6-8ebc-4773-ba0d-7ead3655afae" />


Runs once daily at **00:00 UTC**.

**Steps**

1. Fetch all pending dust from Postgres
2. Aggregate SOL and swap to USDC (Jupiter)
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
  - Jupiter (SOL → USDC)
  - GRAIL (USDC → GOLD)
  - Solana RPC (transaction confirmations)
- All application state lives in PostgreSQL

---

Think of it as:

> **“Turn forgotten SOL dust into GOLD — automatically.”**

---

