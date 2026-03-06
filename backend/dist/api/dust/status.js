"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDustStatus = getDustStatus;
const queries_1 = require("../../db/queries");
async function getDustStatus(req, res) {
    try {
        const { walletAddress } = req.query;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const user = await queries_1.db.createUser(walletAddress);
        const userPending = await queries_1.db.getUserPendingDust(user.id);
        const totalPending = userPending.reduce((sum, d) => sum + Number(d.usdc_amount), 0);
        res.json({
            success: true,
            data: {
                pendingAmount: totalPending,
                queueCount: userPending.length,
                status: userPending.length > 0 ? "pending" : "none",
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
