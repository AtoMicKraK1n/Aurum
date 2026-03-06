"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserBalance = getUserBalance;
const web3_js_1 = require("@solana/web3.js");
const queries_1 = require("../../db/queries");
const user_1 = require("../../lib/grail/user");
const provision_1 = require("../../lib/grail/provision");
const connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL);
async function getUserBalance(req, res) {
    try {
        const { walletAddress } = req.query;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const user = await queries_1.db.createUser(walletAddress);
        const pubkey = new web3_js_1.PublicKey(walletAddress);
        const lamports = await connection.getBalance(pubkey);
        const solBalance = lamports / web3_js_1.LAMPORTS_PER_SOL;
        // Custodial ledger gold distributed by batch jobs.
        const goldBalance = await queries_1.db.getGoldBalance(user.id);
        // Auto-provision GRAIL linkage for existing app users that missed initial registration.
        let linkedUser = user;
        if (!linkedUser.grail_user_id) {
            const provision = await (0, provision_1.ensureGrailProvisionedUser)(user);
            if (provision.status !== "failed") {
                linkedUser = provision.user;
            }
            else {
                console.warn(`GRAIL provisioning skipped in balance API for user ${user.id}: ${provision.error}`);
            }
        }
        // Optional on-chain GRAIL user account balance (can differ in custodial flow).
        let onChainGrailGold = 0;
        if (linkedUser.grail_user_id) {
            onChainGrailGold = await (0, user_1.getGrailUserBalance)(linkedUser.grail_user_id);
        }
        res.json({
            success: true,
            data: {
                balances: {
                    sol: solBalance,
                    gold: goldBalance,
                    onChainGrailGold,
                },
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
