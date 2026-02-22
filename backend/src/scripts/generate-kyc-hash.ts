import { keccak_256 } from "@noble/hashes/sha3.js";
import bs58 from "bs58";

const walletAddress = process.argv[2];

if (!walletAddress) {
  console.error(
    "Usage: bun run src/scripts/generate-kyc-hash.ts <wallet-address>",
  );
  process.exit(1);
}

const kycData = JSON.stringify({
  walletAddress,
  timestamp: Date.now(),
  platform: "aurum",
});

const hashBytes = keccak_256(new TextEncoder().encode(kycData));
const kycHash = bs58.encode(hashBytes);

console.log("Wallet:", walletAddress);
console.log("KYC Hash:", kycHash);
