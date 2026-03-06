"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueDust = queueDust;
const queries_1 = require("../../db/queries");
async function queueDust(req, res) {
    try {
        const allowUnsafeQueue = process.env.ALLOW_UNVERIFIED_DUST_QUEUE === "true";
        if (!allowUnsafeQueue) {
            res.status(410).json({
                success: false,
                error: "Direct queue is disabled. Use /api/deposits/create-intent and /api/deposits/confirm.",
            });
            return;
        }
        const { walletAddress, usdcAmount } = req.body;
        if (!walletAddress || usdcAmount === undefined) {
            res
                .status(400)
                .json({ success: false, error: "Missing required fields" });
            return;
        }
        if (typeof usdcAmount !== "number" || !Number.isFinite(usdcAmount)) {
            res.status(400).json({
                success: false,
                error: "usdcAmount must be a valid number",
            });
            return;
        }
        if (usdcAmount <= 0) {
            res
                .status(400)
                .json({ success: false, error: "Amount must be positive" });
            return;
        }
        const user = await queries_1.db.getUserByWallet(walletAddress);
        if (!user) {
            res.status(404).json({ success: false, error: "User not found" });
            return;
        }
        const queue = await queries_1.db.queueDust(user.id, usdcAmount);
        res.json({
            success: true,
            data: {
                queue,
                message: "Dust queued for next batch (within 24hrs)",
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
