"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = getUserProfile;
const queries_1 = require("../../db/queries");
async function getUserProfile(req, res) {
    try {
        const { walletAddress } = req.query;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const user = await queries_1.db.getUserByWallet(walletAddress);
        if (!user) {
            res.json({
                success: true,
                data: {
                    exists: false,
                    grailLinked: false,
                },
            });
            return;
        }
        res.json({
            success: true,
            data: {
                exists: true,
                grailLinked: Boolean(user.grail_user_id),
                user,
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
