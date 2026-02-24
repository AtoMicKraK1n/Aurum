import { db } from "../../db/queries";
import { purchaseGoldPartner } from "../grail/purchase";

export async function runBatchConversion(): Promise<{
  batchId: string;
  totalUsdc: number;
  totalGold: number;
  usersProcessed: number;
}> {
  console.log("Starting batch conversion...");

  const pendingDust = await db.getPendingDust();

  if (pendingDust.length === 0) {
    console.log("No pending USDC dust to process");
    return { batchId: "", totalUsdc: 0, totalGold: 0, usersProcessed: 0 };
  }

  const totalUsdc = pendingDust.reduce((sum, d) => sum + d.usdc_amount, 0);

  console.log(`Processing ${pendingDust.length} users, ${totalUsdc} USDC`);
  const batchId = await db.createBatch(totalUsdc);

  for (const dust of pendingDust) {
    await db.updateDustStatus(dust.id, "processing", batchId);
  }

  try {
    console.log("Buying GOLD via GRAIL...");
    const { goldAmount, txSignature: grailTx } =
      await purchaseGoldPartner(totalUsdc);
    console.log(`Purchased ${goldAmount} oz GOLD (tx: ${grailTx})`);

    await db.updateBatch(batchId, {
      total_usdc: totalUsdc,
      total_gold: goldAmount,
      grail_tx_signature: grailTx,
      status: "completed",
    });

    console.log("Distributing gold to users...");
    for (const dust of pendingDust) {
      const userShare = (dust.usdc_amount / totalUsdc) * goldAmount;
      await db.updateGoldBalance(dust.user_id, userShare);
      await db.updateDustStatus(dust.id, "completed", batchId);
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
    await db.updateBatch(batchId, { status: "failed" });

    for (const dust of pendingDust) {
      await db.updateDustStatus(dust.id, "failed", batchId);
    }

    throw error;
  }
}
