import {
  purchaseGoldForUser,
  purchaseGoldPartner,
} from "../lib/grail/purchase";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

type PurchaseMode = "partner" | "user" | "both";

function parseMode(value: string | undefined): PurchaseMode {
  if (value === "partner" || value === "user" || value === "both") {
    return value;
  }
  return "partner";
}

function parseAmount(value: string | undefined): number {
  const amount = Number(value ?? "1");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid TEST_USDC_AMOUNT: ${value}`);
  }
  return amount;
}

function parseSlippage(value: string | undefined): number {
  const slippage = Number(value ?? "5");
  if (!Number.isFinite(slippage) || slippage <= 0) {
    throw new Error(`Invalid TEST_SLIPPAGE_PERCENT: ${value}`);
  }
  return slippage;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseOptionalKeypair(value: string | undefined): Keypair | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function runPartnerPurchase(usdcAmount: number, slippagePercent: number) {
  console.log("\n--- Testing Partner Purchase ---");
  const result = await purchaseGoldPartner(usdcAmount, slippagePercent);
  console.log("Partner purchase successful");
  console.log("   Gold:", result.goldAmount, "oz");
  console.log("   Tx:", result.txSignature);
}

async function runUserPurchase(
  userId: string,
  usdcAmount: number,
  slippagePercent: number,
  cosign: boolean,
  userAsFeePayer: boolean,
  userSigner?: Keypair,
) {
  console.log("\n--- Testing User Purchase ---");
  console.log("User ID:", userId);
  console.log("cosign:", cosign);
  console.log("userAsFeePayer:", userAsFeePayer);
  const result = await purchaseGoldForUser(
    userId,
    usdcAmount,
    slippagePercent,
    cosign,
    userAsFeePayer,
    userSigner,
  );
  console.log("User purchase successful");
  console.log("   Gold:", result.goldAmount, "oz");
  console.log("   Tx:", result.txSignature);
}

async function testPurchase() {
  console.log("Testing GRAIL gold purchase");
  console.log("This script submits real transactions.\n");

  const mode = parseMode(process.env.TEST_PURCHASE_MODE);
  const usdcAmount = parseAmount(process.env.TEST_USDC_AMOUNT);
  const slippagePercent = parseSlippage(process.env.TEST_SLIPPAGE_PERCENT);
  const cosign = parseBoolean(process.env.TEST_COSIGN, false);
  const userAsFeePayer = parseBoolean(process.env.TEST_USER_AS_FEE_PAYER, true);
  const userId = process.env.TEST_GRAIL_USER_ID;
  const userSigner = parseOptionalKeypair(process.env.TEST_USER_PRIVATE_KEY);

  console.log("Config:");
  console.log("  mode:", mode);
  console.log("  usdcAmount:", usdcAmount);
  console.log("  slippagePercent:", slippagePercent);
  console.log("  cosign:", cosign);
  console.log("  userAsFeePayer:", userAsFeePayer);
  console.log("  userSignerProvided:", Boolean(userSigner));
  if (userId) {
    console.log("  userId:", userId);
  }

  if ((mode === "user" || mode === "both") && !userId) {
    throw new Error(
      "TEST_GRAIL_USER_ID is required when TEST_PURCHASE_MODE is 'user' or 'both'",
    );
  }

  if (mode === "partner" || mode === "both") {
    await runPartnerPurchase(usdcAmount, slippagePercent);
  }

  if (mode === "user" || mode === "both") {
    await runUserPurchase(
      userId as string,
      usdcAmount,
      slippagePercent,
      cosign,
      userAsFeePayer,
      userSigner,
    );
  }

  console.log("\nPurchase test passed");
}

testPurchase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Purchase test failed");
    if (error instanceof Error) {
      console.error(error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  });
