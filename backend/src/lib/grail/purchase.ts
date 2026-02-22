import axios from "axios";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const GRAIL_API =
  process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app";
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const executiveAuthority = Keypair.fromSecretKey(
  bs58.decode(process.env.SPONSOR_PRIVATE_KEY!),
);

export async function estimateGoldPurchase(
  usdcAmount: number,
): Promise<{ goldAmount: number; goldPricePerOunce: number }> {
  try {
    const estimatedGold = usdcAmount / 5000;

    const response = await axios.post(
      `${GRAIL_API}/api/trading/estimate/buy`,
      { goldAmount: estimatedGold },
      { headers: { "x-api-key": GRAIL_API_KEY } },
    );

    return {
      goldAmount: response.data.data.goldAmount,
      goldPricePerOunce: response.data.data.goldPricePerOunce,
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
): Promise<{
  goldAmount: number;
  txSignature: string;
}> {
  try {
    console.log(`Purchasing gold for user ${userId} with ${usdcAmount} USDC`);

    const { goldAmount } = await estimateGoldPurchase(usdcAmount);
    console.log(`📊 Estimate: ${goldAmount} oz gold`);
    const maxUsdcAmount = usdcAmount * (1 + slippagePercent / 100);
    const response = await axios.post(
      `${GRAIL_API}/api/trading/purchases/user`,
      {
        userId,
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
    console.log("Purchase transaction created");

    const tx = Transaction.from(
      Buffer.from(transaction.serializedTx, "base64"),
    );

    tx.sign(executiveAuthority);

    const txSignature = await connection.sendRawTransaction(tx.serialize());

    console.log(`Confirming purchase: ${txSignature}`);
    await connection.confirmTransaction(txSignature);

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

export async function purchaseGoldPartner(
  usdcAmount: number,
  slippagePercent: number = 5,
): Promise<{
  goldAmount: number;
  txSignature: string;
}> {
  try {
    console.log(`💰 Purchasing gold for partner with ${usdcAmount} USDC`);

    const { goldAmount } = await estimateGoldPurchase(usdcAmount);
    console.log(`📊 Estimate: ${goldAmount} oz gold`);
    const maxUsdcAmount = usdcAmount * (1 + slippagePercent / 100);

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

    const tx = Transaction.from(
      Buffer.from(transaction.serializedTx, "base64"),
    );

    tx.sign(executiveAuthority);

    const txSignature = await connection.sendRawTransaction(tx.serialize());

    console.log(`Confirming purchase: ${txSignature}`);
    await connection.confirmTransaction(txSignature);

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
