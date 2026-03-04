import axios from "axios";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const GRAIL_API = (
  process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app"
).replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;
const GRAIL_HTTP_TIMEOUT_MS = Number(process.env.GRAIL_HTTP_TIMEOUT_MS || 15000);
const TX_CONFIRM_TIMEOUT_MS = Number(process.env.TX_CONFIRM_TIMEOUT_MS || 45000);

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const executiveAuthority = Keypair.fromSecretKey(
  bs58.decode(process.env.SPONSOR_PRIVATE_KEY!),
);

type GrailUserLookup = {
  userId: string;
  userPda?: string;
};

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

export async function generateKycHash(walletAddress: string): Promise<string> {
  const kycData = JSON.stringify({
    walletAddress: walletAddress.trim(),
    platform: "aurum",
  });

  const hashBytes = keccak_256(new TextEncoder().encode(kycData));
  return bs58.encode(hashBytes);
}

export async function registerGrailUser(walletAddress: string): Promise<{
  userId: string;
  userPda: string;
  txSignature: string;
}> {
  try {
    const sanitizedWallet = walletAddress.trim();
    // Fail fast on malformed wallet values before hitting Grail API.
    new PublicKey(sanitizedWallet);
    console.log(`Registering user in GRAIL: ${sanitizedWallet}`);

    const kycHash = await generateKycHash(sanitizedWallet);
    console.log(`KYC hash generated: ${kycHash.substring(0, 16)}...`);

    const response = await axios.post(
      `${GRAIL_API}/api/users`,
      {
        kycHash,
        userWalletAddress: sanitizedWallet,
        metadata: {
          referenceId: sanitizedWallet,
          tags: ["retail", "aurum"],
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": GRAIL_API_KEY,
        },
        timeout: GRAIL_HTTP_TIMEOUT_MS,
      },
    );

    const { userId, userPda, transaction } = response.data.data;
    console.log(`GRAIL user created: ${userId}`);
    console.log("Signing user creation transaction...");
    const tx = Transaction.from(
      Buffer.from(transaction.serializedTx, "base64"),
    );

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
  } catch (error) {
    console.error("GRAIL user registration failed:", error);

    if (axios.isAxiosError(error)) {
      const responseError = String(error.response?.data?.error || "");
      if (
        error.response?.status === 400 &&
        responseError.toLowerCase().includes("already exists")
      ) {
        const resolved = await findExistingGrailUserByWallet(walletAddress);
        if (resolved) {
          console.log(
            `Resolved existing GRAIL user by wallet: ${resolved.userId}`,
          );
          return {
            userId: resolved.userId,
            userPda: resolved.userPda || resolved.userId,
            txSignature: "existing_user_no_registration_tx",
          };
        }

        // Last-resort fallback: many integrations use wallet address as userId.
        // If this assumption is wrong, downstream calls will return "User not found".
        return {
          userId: walletAddress.trim(),
          userPda: walletAddress.trim(),
          txSignature: "existing_user_wallet_fallback",
        };
      }

      const detail =
        typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data);
      console.error("Response:", error.response?.data);
      throw new Error(
        `Failed to register user in GRAIL: ${error.message}${detail ? ` | ${detail}` : ""}`,
      );
    }

    throw new Error(
      `Failed to register user in GRAIL: ${(error as Error).message}`,
    );
  }
}

function pickUserLookupCandidate(payload: unknown): GrailUserLookup | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const dataContainer = payload as {
    data?: unknown;
    userId?: unknown;
    userPda?: unknown;
  };

  const pickFrom = (item: unknown): GrailUserLookup | null => {
    if (!item || typeof item !== "object") {
      return null;
    }
    const row = item as {
      userId?: unknown;
      id?: unknown;
      userPda?: unknown;
      pda?: unknown;
    };
    const userId =
      typeof row.userId === "string"
        ? row.userId
        : typeof row.id === "string"
          ? row.id
          : "";
    if (!userId) {
      return null;
    }
    const userPda =
      typeof row.userPda === "string"
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

async function findExistingGrailUserByWallet(
  walletAddress: string,
): Promise<GrailUserLookup | null> {
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
      const response = await axios.get(url, {
        headers: {
          "x-api-key": GRAIL_API_KEY,
        },
        timeout: GRAIL_HTTP_TIMEOUT_MS,
      });
      const candidate = pickUserLookupCandidate(response.data);
      if (candidate) {
        return candidate;
      }
    } catch {
      // Try next known lookup pattern.
    }
  }

  return null;
}

export async function getGrailUserBalance(userId: string): Promise<number> {
  try {
    const response = await axios.get(`${GRAIL_API}/api/users/${userId}`, {
      headers: {
        "x-api-key": GRAIL_API_KEY,
      },
      timeout: GRAIL_HTTP_TIMEOUT_MS,
    });

    return response.data.data.balancesManagedByProgram?.gold?.amount || 0;
  } catch (error) {
    console.error("Failed to get GRAIL balance:", error);
    return 0;
  }
}
