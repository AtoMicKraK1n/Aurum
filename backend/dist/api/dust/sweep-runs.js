"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDustSweepRuns = listDustSweepRuns;
const queries_1 = require("../../db/queries");
async function listDustSweepRuns(req, res) {
    try {
        const { walletAddress, limit } = req.query;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const parsedLimit = typeof limit === "string" ? Number.parseInt(limit, 10) : 20;
        const safeLimit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 20;
        const user = await queries_1.db.createUser(walletAddress);
        const runs = await queries_1.db.listDustSweepRuns(user.id, safeLimit);
        res.json({
            success: true,
            data: {
                runs: runs.map((run) => ({
                    id: run.id,
                    status: run.status,
                    triggerAmountUsdc: Number(run.trigger_amount_usdc),
                    sweepAmountUsdc: Number(run.sweep_amount_usdc),
                    tradeId: run.trade_id,
                    txSignature: run.tx_signature,
                    errorMessage: run.error_message,
                    metadata: run.metadata,
                    createdAt: run.created_at.toISOString(),
                    updatedAt: run.updated_at.toISOString(),
                })),
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
