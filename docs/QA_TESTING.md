# Aurum QA Testing Guide

Base URL example: `https://aurum-rodf.onrender.com`

## Required Inputs

- `Base URL`: backend URL (local or deployed)
- `Wallet Address`: devnet wallet to test with
- `USDC Amount`: amount for deposit intent, e.g. `1.25`
- `Admin API Key`: needed only for `Run Batch`
- `Intent ID`: produced by `Create Deposit Intent`
- `Tx Signature`: produced by actual devnet USDC transfer

## End-to-End Test Order

1. `Connect Wallet`  
   Creates/loads user and ensures GRAIL linkage.
2. `Create Deposit Intent`  
   Generates `intentId` and expected treasury details.
3. Send USDC transfer in wallet  
   From user wallet -> treasury wallet using devnet USDC mint.
4. `Confirm Deposit`  
   Submit `intentId` + transfer `txSignature`; backend verifies on-chain transfer and queues dust.
5. `Run Batch (Admin)`  
   Triggers batch conversion and distribution.
6. `User Balance`  
   Verify `balances.gold` increased (custodial ledger balance).

## Common Mistakes

- Using placeholder string instead of real tx signature.
- Sending wrong mint (must be devnet USDC).
- Sending from a wallet different from the one used in intent.
- Not using admin key for batch run.
- Expired intent (create a new one).

## Expected Balance Fields

- `gold`: internal custodial ledger balance (primary app value)
- `onChainGrailGold`: on-chain per-user GRAIL balance (may remain `0` in partner purchase flow)
