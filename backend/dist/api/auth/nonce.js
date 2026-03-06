"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthNonceChallenge = createAuthNonceChallenge;
const queries_1 = require("../../db/queries");
const wallet_signature_1 = require("../../lib/auth/wallet-signature");
async function createAuthNonceChallenge(req, res) {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const nonce = (0, wallet_signature_1.createAuthNonce)();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await queries_1.db.createWalletAuthNonce(walletAddress, nonce, expiresAt);
        res.json({
            success: true,
            data: {
                nonce,
                message: (0, wallet_signature_1.getAuthMessage)(walletAddress, nonce),
                expiresAt: expiresAt.toISOString(),
            },
        });
    }
    catch (error) {
        console.error("createAuthNonceChallenge failed:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unexpected server error",
        });
    }
}
