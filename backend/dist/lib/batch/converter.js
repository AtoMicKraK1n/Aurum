"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBatchConversion = runBatchConversion;
exports.runBatchConversionWithDeps = runBatchConversionWithDeps;
const queries_1 = require("../../db/queries");
const purchase_1 = require("../grail/purchase");
const defaultDeps = {
    getPendingDust: () => queries_1.db.getPendingDust(),
    createBatch: (totalUsdc) => queries_1.db.createBatch(totalUsdc),
    updateDustStatus: (dustId, status, batchId) => queries_1.db.updateDustStatus(dustId, status, batchId),
    updateBatch: (batchId, updates) => queries_1.db.updateBatch(batchId, updates),
    updateGoldBalance: (userId, goldAmount) => queries_1.db.updateGoldBalance(userId, goldAmount),
    // TODO(2026-03-31): Remove custodial batch purchase path after self-custody validation window.
    purchaseGold: (usdcAmount) => (0, purchase_1.purchaseGoldPartner)(usdcAmount),
};
async function runBatchConversion() {
    return runBatchConversionWithDeps(defaultDeps);
}
async function runBatchConversionWithDeps(deps) {
    console.log("Starting batch conversion...");
    const pendingDust = await deps.getPendingDust();
    if (pendingDust.length === 0) {
        console.log("No pending USDC dust to process");
        return { batchId: "", totalUsdc: 0, totalGold: 0, usersProcessed: 0 };
    }
    const totalUsdc = pendingDust.reduce((sum, d) => sum + Number(d.usdc_amount), 0);
    console.log(`Processing ${pendingDust.length} users, ${totalUsdc} USDC`);
    const batchId = await deps.createBatch(totalUsdc);
    for (const dust of pendingDust) {
        await deps.updateDustStatus(dust.id, "processing", batchId);
    }
    try {
        console.log("Buying GOLD via GRAIL...");
        const { goldAmount, txSignature: grailTx } = await deps.purchaseGold(totalUsdc);
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
    }
    catch (error) {
        console.error("Batch failed:", error);
        await deps.updateBatch(batchId, { status: "failed" });
        for (const dust of pendingDust) {
            await deps.updateDustStatus(dust.id, "failed", batchId);
        }
        throw error;
    }
}
