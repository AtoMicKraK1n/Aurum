import axios from "axios";
import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const GRAIL_API = (
  process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app"
).replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const executiveAuthority = Keypair.fromSecretKey(
  bs58.decode(process.env.SPONSOR_PRIVATE_KEY!),
);

function deserializeAnyTransaction(
  serializedTxBase64: string,
): Transaction | VersionedTransaction {
  const bytes = Buffer.from(serializedTxBase64, "base64");
  try {
    return Transaction.from(bytes);
  } catch {
    return VersionedTransaction.deserialize(bytes);
  }
}

function getRequiredSignerPubkeys(
  tx: Transaction | VersionedTransaction,
): string[] {
  if (tx instanceof Transaction) {
    return tx.signatures.map((entry) => entry.publicKey.toBase58());
  }

  const required = tx.message.header.numRequiredSignatures;
  return tx.message.staticAccountKeys
    .slice(0, required)
    .map((key) => key.toBase58());
}

function getMissingSignerPubkeys(
  tx: Transaction | VersionedTransaction,
): string[] {
  if (tx instanceof Transaction) {
    return tx.signatures
      .filter((entry) => !entry.signature)
      .map((entry) => entry.publicKey.toBase58());
  }

  const requiredKeys = getRequiredSignerPubkeys(tx);
  return tx.signatures
    .map((sig, index) => ({ sig, key: requiredKeys[index] }))
    .filter(({ sig }) => sig.every((byte) => byte === 0))
    .map(({ key }) => key);
}

async function signAndSendTransaction(
  tx: Transaction | VersionedTransaction,
  extraSigners: Keypair[] = [],
): Promise<string> {
  const allSigners = [executiveAuthority, ...extraSigners];

  if (tx instanceof Transaction) {
    tx.sign(...allSigners);
  } else {
    tx.sign(allSigners);
  }

  const requiredSigners = getRequiredSignerPubkeys(tx);
  const missingSigners = getMissingSignerPubkeys(tx);
  if (missingSigners.length > 0) {
    throw new Error(
      `Missing required signatures. required=[${requiredSigners.join(", ")}] missing=[${missingSigners.join(", ")}] provided=[${allSigners.map((s) => s.publicKey.toBase58()).join(", ")}]`,
    );
  }

  const txSignature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(txSignature);
  return txSignature;
}

export async function estimateGoldPurchase(targetUsdcAmount: number): Promise<{
  goldAmount: number;
  goldPricePerOunce: number;
  estimatedUsdcAmount: number;
}> {
  try {
    const response = await axios.post(
      `${GRAIL_API}/api/trading/estimate/buy`,
      { goldAmount: targetUsdcAmount / 5000 },
      { headers: { "x-api-key": GRAIL_API_KEY } },
    );

    const data = response.data?.data || {};
    const goldAmount = Number(data.goldAmount || 0);
    const goldPricePerOunce = Number(data.goldPricePerOunce || 0);
    const estimatedUsdcAmount = Number(
      data.usdcAmount ??
        data.quoteUsdcAmount ??
        (goldAmount > 0 && goldPricePerOunce > 0
          ? goldAmount * goldPricePerOunce
          : targetUsdcAmount),
    );

    return {
      goldAmount,
      goldPricePerOunce,
      estimatedUsdcAmount:
        Number.isFinite(estimatedUsdcAmount) && estimatedUsdcAmount > 0
          ? estimatedUsdcAmount
          : targetUsdcAmount,
    };
  } catch (error) {
    console.error("Failed to estimate gold purchase:", error);
    throw error;
  }
}

export async function purchaseGoldForUser(
  userId: string,
  usdcAmount: number,
  slippagePercent: number = 5,
  cosign: boolean = false,
  userAsFeePayer: boolean = true,
  userSigner?: Keypair,
): Promise<{
  goldAmount: number;
  txSignature: string;
}> {
  try {
    console.log(`Purchasing gold for user ${userId} with ${usdcAmount} USDC`);

    const { goldAmount, estimatedUsdcAmount } =
      await estimateGoldPurchase(usdcAmount);
    console.log(
      `Estimate: ${goldAmount} oz gold at ~${estimatedUsdcAmount} USDC`,
    );
    const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);
    const response = await axios.post(
      `${GRAIL_API}/api/trading/purchases/user`,
      {
        userId,
        goldAmount,
        maxUsdcAmount,
        co_sign: cosign,
        userAsFeePayer,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": GRAIL_API_KEY,
        },
      },
    );

    const { transaction } = response.data.data;
    console.log("Purchase transaction created");

    const tx = deserializeAnyTransaction(transaction.serializedTx);
    const requiredSigners = getRequiredSignerPubkeys(tx);
    console.log(`Required signers: ${requiredSigners.join(", ")}`);
    const txSignature = await signAndSendTransaction(
      tx,
      userSigner ? [userSigner] : [],
    );

    console.log(`Confirming purchase: ${txSignature}`);

    console.log(`Gold purchased: ${goldAmount} oz (tx: ${txSignature})`);

    return {
      goldAmount: response.data.data.goldAmount,
      txSignature,
    };
  } catch (error) {
    console.error("Gold purchase failed:", error);

    if (axios.isAxiosError(error)) {
      console.error("Response:", error.response?.data);
    }

    throw new Error(`Failed to purchase gold: ${(error as Error).message}`);
  }
}

export async function createSelfCustodyPurchaseIntent(
  userId: string,
  usdcAmount: number,
  slippagePercent: number = 5,
  cosign: boolean = false,
  userAsFeePayer: boolean = true,
): Promise<{
  goldAmount: number;
  maxUsdcAmount: number;
  serializedTx: string;
  signingInstructions?: unknown;
  status?: string;
}> {
  try {
    const { goldAmount, estimatedUsdcAmount } =
      await estimateGoldPurchase(usdcAmount);
    const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);

    const response = await axios.post(
      `${GRAIL_API}/api/trading/purchases/user`,
      {
        userId,
        goldAmount,
        maxUsdcAmount,
        co_sign: cosign,
        userAsFeePayer,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": GRAIL_API_KEY,
        },
      },
    );

    return {
      goldAmount: response.data.data.goldAmount,
      maxUsdcAmount,
      serializedTx: response.data.data.transaction.serializedTx,
      signingInstructions: response.data.data.signingInstructions,
      status: response.data.data.status,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail =
        typeof error.response?.data === "string"
          ? error.response.data
          : JSON.stringify(error.response?.data);
      throw new Error(
        `Failed to create self-custody purchase intent: ${error.message}${detail ? ` | ${detail}` : ""}`,
      );
    }
    throw error;
  }
}

export async function submitSignedSelfCustodyTransaction(
  signedSerializedTx: string,
): Promise<string> {
  const response = await axios.post(
    `${GRAIL_API}/api/transactions/submit`,
    {
      signedTransaction: signedSerializedTx,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": GRAIL_API_KEY,
      },
    },
  );

  const data = response.data?.data || {};
  const txSignature = String(
    data.txSignature ??
      data.transactionSignature ??
      data.signature ??
      "",
  );

  if (!txSignature) {
    throw new Error("Missing transaction signature from Grail submit response");
  }

  return txSignature;
}

export async function purchaseGoldPartner(
  usdcAmount: number,
  slippagePercent: number = 5,
): Promise<{
  goldAmount: number;
  txSignature: string;
}> {
  try {
    console.log(`💰 Purchasing gold for partner with ${usdcAmount} USDC`);

    const { goldAmount, estimatedUsdcAmount } =
      await estimateGoldPurchase(usdcAmount);
    console.log(
      `Estimate: ${goldAmount} oz gold at ~${estimatedUsdcAmount} USDC`,
    );
    const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);

    const response = await axios.post(
      `${GRAIL_API}/api/trading/purchases/partner`,
      {
        goldAmount,
        maxUsdcAmount,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": GRAIL_API_KEY,
        },
      },
    );

    const { transaction } = response.data.data;
    console.log("Partner purchase transaction created");

    const tx = deserializeAnyTransaction(transaction.serializedTx);
    const txSignature = await signAndSendTransaction(tx);

    console.log(`Confirming purchase: ${txSignature}`);

    console.log(
      `Gold purchased for partner: ${goldAmount} oz (tx: ${txSignature})`,
    );

    return {
      goldAmount: response.data.data.goldAmount,
      txSignature,
    };
  } catch (error) {
    console.error("Partner gold purchase failed:", error);

    if (axios.isAxiosError(error)) {
      console.error("Response:", error.response?.data);
    }

    throw new Error(
      `Failed to purchase partner gold: ${(error as Error).message}`,
    );
  }
}
