"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmDeposit = confirmDeposit;
const queries_1 = require("../../db/queries");
const deposit_1 = require("../../lib/solana/deposit");
async function confirmDeposit(req, res) {
    try {
        const { intentId, txSignature } = req.body;
        if (!intentId || !txSignature) {
            res.status(400).json({
                success: false,
                error: "intentId and txSignature are required",
            });
            return;
        }
        const intent = await queries_1.db.getDepositIntentById(intentId);
        if (!intent) {
            res.status(404).json({ success: false, error: "Deposit intent not found" });
            return;
        }
        if (intent.status !== "pending") {
            res.status(409).json({
                success: false,
                error: `Deposit intent already ${intent.status}`,
            });
            return;
        }
        const now = new Date();
        if (new Date(intent.expires_at) < now) {
            await queries_1.db.markDepositIntentStatus(intent.id, "expired");
            res.status(410).json({ success: false, error: "Deposit intent expired" });
            return;
        }
        const verification = await (0, deposit_1.verifyUsdcDeposit)({
            txSignature,
            expectedUsdcAmount: Number(intent.expected_usdc_amount),
            senderWallet: intent.wallet_address,
        });
        await queries_1.db.markDepositIntentConfirmed(intent.id, txSignature);
        const queue = await queries_1.db.queueDust(intent.user_id, Number(intent.expected_usdc_amount));
        await queries_1.db.createDustDepositTransaction(intent.user_id, Number(intent.expected_usdc_amount), txSignature);
        res.json({
            success: true,
            data: {
                queue,
                txSignature,
                receivedUsdcAmount: verification.receivedUsdcAmount,
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
