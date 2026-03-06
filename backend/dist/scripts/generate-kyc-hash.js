"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sha3_js_1 = require("@noble/hashes/sha3.js");
const bs58_1 = __importDefault(require("bs58"));
const walletAddress = process.argv[2];
if (!walletAddress) {
    console.error("Usage: bun run src/scripts/generate-kyc-hash.ts <wallet-address>");
    process.exit(1);
}
const kycData = JSON.stringify({
    walletAddress,
    timestamp: Date.now(),
    platform: "aurum",
});
const hashBytes = (0, sha3_js_1.keccak_256)(new TextEncoder().encode(kycData));
const kycHash = bs58_1.default.encode(hashBytes);
console.log("Wallet:", walletAddress);
console.log("KYC Hash:", kycHash);
