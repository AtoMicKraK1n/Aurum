import { db } from "../../db/queries";
import { purchaseGoldPartner } from "../grail/purchase";

type PendingDust = {
  id: string;
  user_id: string;
  usdc_amount: number;
};

type ConversionDeps = {
  getPendingDust: () => Promise<PendingDust[]>;
  createBatch: (totalUsdc: number) => Promise<string>;
  updateDustStatus: (
    dustId: string,
    status: string,
    batchId?: string,
  ) => Promise<void>;
  updateBatch: (
    batchId: string,
    updates: {
      total_usdc?: number;
      total_gold?: number;
      grail_tx_signature?: string;
      status?: string;
    },
  ) => Promise<void>;
  updateGoldBalance: (userId: string, goldAmount: number) => Promise<void>;
  purchaseGold: (
    usdcAmount: number,
  ) => Promise<{ goldAmount: number; txSignature: string }>;
};

const defaultDeps: ConversionDeps = {
  getPendingDust: () => db.getPendingDust(),
  createBatch: (totalUsdc) => db.createBatch(totalUsdc),
  updateDustStatus: (dustId, status, batchId) =>
    db.updateDustStatus(dustId, status, batchId),
  updateBatch: (batchId, updates) => db.updateBatch(batchId, updates),
  updateGoldBalance: (userId, goldAmount) =>
    db.updateGoldBalance(userId, goldAmount),
  purchaseGold: (usdcAmount) => purchaseGoldPartner(usdcAmount),
};

export async function runBatchConversion(): Promise<{
  batchId: string;
  totalUsdc: number;
  totalGold: number;
  usersProcessed: number;
}> {
  return runBatchConversionWithDeps(defaultDeps);
}

export async function runBatchConversionWithDeps(
  deps: ConversionDeps,
): Promise<{
  batchId: string;
  totalUsdc: number;
  totalGold: number;
  usersProcessed: number;
}> {
  console.log("Starting batch conversion...");

  const pendingDust = await deps.getPendingDust();

  if (pendingDust.length === 0) {
    console.log("No pending USDC dust to process");
    return { batchId: "", totalUsdc: 0, totalGold: 0, usersProcessed: 0 };
  }

  const totalUsdc = pendingDust.reduce(
    (sum, d) => sum + Number(d.usdc_amount),
    0,
  );

  console.log(`Processing ${pendingDust.length} users, ${totalUsdc} USDC`);
  const batchId = await deps.createBatch(totalUsdc);

  for (const dust of pendingDust) {
    await deps.updateDustStatus(dust.id, "processing", batchId);
  }

  try {
    console.log("Buying GOLD via GRAIL...");
    const { goldAmount, txSignature: grailTx } =
      await deps.purchaseGold(totalUsdc);
    console.log(`Purchased ${goldAmount} oz GOLD (tx: ${grailTx})`);

    await deps.updateBatch(batchId, {
      total_usdc: totalUsdc,
      total_gold: goldAmount,
      grail_tx_signature: grailTx,
      status: "completed",
    });

    console.log("Distributing gold to users...");
    for (const dust of pendingDust) {
      const userShare = (Number(dust.usdc_amount) / totalUsdc) * goldAmount;
      await deps.updateGoldBalance(dust.user_id, userShare);
      await deps.updateDustStatus(dust.id, "completed", batchId);
    }

    console.log(`Batch ${batchId} completed!`);

    return {
      batchId,
      totalUsdc,
      totalGold: goldAmount,
      usersProcessed: pendingDust.length,
    };
  } catch (error) {
    console.error("Batch failed:", error);
    await deps.updateBatch(batchId, { status: "failed" });

    for (const dust of pendingDust) {
      await deps.updateDustStatus(dust.id, "failed", batchId);
    }

    throw error;
  }
}
