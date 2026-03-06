"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectWallet = connectWallet;
const queries_1 = require("../../db/queries");
const user_1 = require("../../lib/grail/user");
const wallet_signature_1 = require("../../lib/auth/wallet-signature");
function formatErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error.trim().length > 0) {
        return error;
    }
    return "Unexpected server error";
}
async function connectWallet(req, res) {
    try {
        const { walletAddress, nonce, signature } = req.body;
        if (!walletAddress) {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        if (!nonce || !signature) {
            res
                .status(400)
                .json({ success: false, error: "nonce and signature are required" });
            return;
        }
        const nonceRecord = await queries_1.db.getValidWalletAuthNonce(walletAddress, nonce);
        if (!nonceRecord) {
            res.status(401).json({ success: false, error: "Invalid or expired nonce" });
            return;
        }
        const isValidSignature = (0, wallet_signature_1.verifyWalletSignature)({
            walletAddress,
            nonce,
            signatureBase58: signature,
        });
        if (!isValidSignature) {
            res.status(401).json({ success: false, error: "Invalid wallet signature" });
            return;
        }
        await queries_1.db.markWalletAuthNonceUsed(nonceRecord.id);
        console.log(`🔌 Wallet connecting: ${walletAddress}`);
        // Create/get user
        console.log("Checking/creating user in database...");
        const user = await queries_1.db.createUser(walletAddress);
        console.log(`Database user ready: ${user.id}`);
        // Register in GRAIL
        if (!user.grail_user_id) {
            console.log("🆕 New user - registering in GRAIL...");
            try {
                const { userId, userPda } = await (0, user_1.registerGrailUser)(walletAddress);
                await queries_1.db.updateGrailUser(user.id, userId, userPda);
                console.log(`✅ User registered in GRAIL: ${userId}`);
                res.json({
                    success: true,
                    data: {
                        user: {
                            ...user,
                            grail_user_id: userId,
                            grail_user_pda: userPda,
                        },
                        isNewUser: true,
                    },
                });
                return;
            }
            catch (grailError) {
                console.error("❌ GRAIL registration failed:", grailError);
                res.json({
                    success: true,
                    data: {
                        user,
                        isNewUser: true,
                    },
                });
                return;
            }
        }
        console.log(`✅ Existing user: ${user.grail_user_id}`);
        res.json({
            success: true,
            data: {
                user,
                isNewUser: false,
            },
        });
    }
    catch (error) {
        console.error("connectWallet failed:", error);
        res.status(500).json({
            success: false,
            error: formatErrorMessage(error),
        });
    }
}
