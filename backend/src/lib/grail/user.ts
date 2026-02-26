import axios from "axios";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
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

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
}

export async function generateKycHash(walletAddress: string): Promise<string> {
  const kycData = JSON.stringify({
    walletAddress,
    timestamp: Date.now(),
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
    console.log(`Registering user in GRAIL: ${walletAddress}`);

    const kycHash = await generateKycHash(walletAddress);
    console.log(`KYC hash generated: ${kycHash.substring(0, 16)}...`);

    const response = await axios.post(
      `${GRAIL_API}/api/users`,
      {
        kycHash,
        userWalletAddress: walletAddress,
        metadata: {
          referenceId: walletAddress,
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
      console.error("Response:", error.response?.data);
    }

    throw new Error(
      `Failed to register user in GRAIL: ${(error as Error).message}`,
    );
  }
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
