"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitSelfPurchase = submitSelfPurchase;
const queries_1 = require("../../db/queries");
const purchase_1 = require("../../lib/grail/purchase");
const purchase_mode_1 = require("../../lib/purchase-mode");
async function submitSelfPurchase(req, res) {
    try {
        if (!(0, purchase_mode_1.isSelfCustodyEnabled)()) {
            res.status(409).json({
                success: false,
                error: "Self-custody purchases are disabled (PURCHASE_OPERATING_MODE=custodial). Use deposit intent + batch flow.",
            });
            return;
        }
        const { tradeId, signedSerializedTx, signedTransaction } = req.body;
        const signedPayload = typeof signedSerializedTx === "string" && signedSerializedTx.length > 0
            ? signedSerializedTx
            : typeof signedTransaction === "string" && signedTransaction.length > 0
                ? signedTransaction
                : "";
        if (!tradeId || !signedPayload) {
            res.status(400).json({
                success: false,
                error: "tradeId and signedSerializedTx (or signedTransaction) are required",
            });
            return;
        }
        const trade = await queries_1.db.getSelfCustodyTradeById(tradeId);
        if (!trade) {
            res.status(404).json({ success: false, error: "Trade not found" });
            return;
        }
        if (trade.status !== "pending") {
            if (trade.status === "completed" && trade.submitted_tx_signature) {
                res.json({
                    success: true,
                    data: {
                        tradeId,
                        txSignature: trade.submitted_tx_signature,
                        status: "completed",
                    },
                });
                return;
            }
            res.status(409).json({
                success: false,
                error: `Trade already ${trade.status}`,
            });
            return;
        }
        try {
            const txSignature = await (0, purchase_1.submitSignedSelfCustodyTransaction)(signedPayload);
            await queries_1.db.completeSelfCustodyTrade({
                tradeId,
                signedSerializedTx: signedPayload,
                submittedTxSignature: txSignature,
            });
            res.json({
                success: true,
                data: {
                    tradeId,
                    txSignature,
                    status: "completed",
                },
            });
        }
        catch (error) {
            try {
                await queries_1.db.failSelfCustodyTrade(tradeId, error.message);
            }
            catch (markFailedError) {
                console.error("Failed to mark self-custody trade as failed:", markFailedError);
            }
            throw error;
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
