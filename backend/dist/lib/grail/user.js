"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKycHash = generateKycHash;
exports.registerGrailUser = registerGrailUser;
exports.getGrailUserBalance = getGrailUserBalance;
const axios_1 = __importDefault(require("axios"));
const sha3_js_1 = require("@noble/hashes/sha3.js");
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const GRAIL_API = (process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app").replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;
const GRAIL_HTTP_TIMEOUT_MS = Number(process.env.GRAIL_HTTP_TIMEOUT_MS || 15000);
const TX_CONFIRM_TIMEOUT_MS = Number(process.env.TX_CONFIRM_TIMEOUT_MS || 45000);
const connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL);
const executiveAuthority = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(process.env.SPONSOR_PRIVATE_KEY));
function timeoutAfter(ms, label) {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
}
async function generateKycHash(walletAddress) {
    const kycData = JSON.stringify({
        walletAddress: walletAddress.trim(),
        platform: "aurum",
    });
    const hashBytes = (0, sha3_js_1.keccak_256)(new TextEncoder().encode(kycData));
    return bs58_1.default.encode(hashBytes);
}
async function registerGrailUser(walletAddress) {
    try {
        const sanitizedWallet = walletAddress.trim();
        // Fail fast on malformed wallet values before hitting Grail API.
        new web3_js_1.PublicKey(sanitizedWallet);
        console.log(`Registering user in GRAIL: ${sanitizedWallet}`);
        const kycHash = await generateKycHash(sanitizedWallet);
        console.log(`KYC hash generated: ${kycHash.substring(0, 16)}...`);
        const response = await axios_1.default.post(`${GRAIL_API}/api/users`, {
            kycHash,
            userWalletAddress: sanitizedWallet,
            metadata: {
                referenceId: sanitizedWallet,
                tags: ["retail", "aurum"],
            },
        }, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
            timeout: GRAIL_HTTP_TIMEOUT_MS,
        });
        const { userId, userPda, transaction } = response.data.data;
        console.log(`GRAIL user created: ${userId}`);
        console.log("Signing user creation transaction...");
        const tx = web3_js_1.Transaction.from(Buffer.from(transaction.serializedTx, "base64"));
        tx.sign(executiveAuthority);
        const txSignature = await connection.sendRawTransaction(tx.serialize());
        console.log(`Confirming transaction: ${txSignature}`);
        await Promise.race([
            connection.confirmTransaction(txSignature),
            timeoutAfter(TX_CONFIRM_TIMEOUT_MS, "Transaction confirmation"),
        ]);
        console.log(`User registered on-chain: ${txSignature}`);
        return {
            userId,
            userPda,
            txSignature,
        };
    }
    catch (error) {
        console.error("GRAIL user registration failed:", error);
        if (axios_1.default.isAxiosError(error)) {
            const responseDetail = typeof error.response?.data === "string"
                ? error.response.data
                : JSON.stringify(error.response?.data || {});
            if (error.response?.status === 400 &&
                /already exists/i.test(responseDetail)) {
                const resolved = await findExistingGrailUserByWallet(walletAddress);
                if (resolved) {
                    console.log(`Resolved existing GRAIL user by wallet: ${resolved.userId}`);
                    return {
                        userId: resolved.userId,
                        userPda: resolved.userPda || resolved.userId,
                        txSignature: "existing_user_no_registration_tx",
                    };
                }
                throw new Error(`GRAIL reports user already exists but lookup by wallet failed for ${walletAddress.trim()}`);
            }
            console.error("Response:", error.response?.data);
            throw new Error(`Failed to register user in GRAIL: ${error.message}${responseDetail ? ` | ${responseDetail}` : ""}`);
        }
        throw new Error(`Failed to register user in GRAIL: ${error.message}`);
    }
}
function pickUserLookupCandidate(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const dataContainer = payload;
    const pickFrom = (item) => {
        if (!item || typeof item !== "object") {
            return null;
        }
        const row = item;
        const userId = typeof row.userId === "string"
            ? row.userId
            : typeof row.id === "string"
                ? row.id
                : "";
        if (!userId) {
            return null;
        }
        const userPda = typeof row.userPda === "string"
            ? row.userPda
            : typeof row.pda === "string"
                ? row.pda
                : undefined;
        return { userId, userPda };
    };
    if (Array.isArray(dataContainer.data)) {
        for (const entry of dataContainer.data) {
            const candidate = pickFrom(entry);
            if (candidate) {
                return candidate;
            }
        }
    }
    if (dataContainer.data) {
        const candidate = pickFrom(dataContainer.data);
        if (candidate) {
            return candidate;
        }
    }
    return pickFrom(dataContainer);
}
async function findExistingGrailUserByWallet(walletAddress) {
    const wallet = encodeURIComponent(walletAddress.trim());
    const lookupUrls = [
        `${GRAIL_API}/api/users?userWalletAddress=${wallet}`,
        `${GRAIL_API}/api/users?walletAddress=${wallet}`,
        `${GRAIL_API}/api/users/by-wallet/${wallet}`,
        `${GRAIL_API}/api/users/wallet/${wallet}`,
        `${GRAIL_API}/api/users/${wallet}`,
    ];
    for (const url of lookupUrls) {
        try {
            const response = await axios_1.default.get(url, {
                headers: {
                    "x-api-key": GRAIL_API_KEY,
                },
                timeout: GRAIL_HTTP_TIMEOUT_MS,
            });
            const candidate = pickUserLookupCandidate(response.data);
            if (candidate) {
                return candidate;
            }
        }
        catch {
            // Try next known lookup pattern.
        }
    }
    return null;
}
async function getGrailUserBalance(userId) {
    try {
        const response = await axios_1.default.get(`${GRAIL_API}/api/users/${userId}`, {
            headers: {
                "x-api-key": GRAIL_API_KEY,
            },
            timeout: GRAIL_HTTP_TIMEOUT_MS,
        });
        return response.data.data.balancesManagedByProgram?.gold?.amount || 0;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
            return 0;
        }
        console.error("Failed to get GRAIL balance:", error);
        return 0;
    }
}
