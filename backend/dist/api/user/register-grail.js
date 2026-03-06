"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUserInGrail = registerUserInGrail;
const queries_1 = require("../../db/queries");
const provision_1 = require("../../lib/grail/provision");
async function registerUserInGrail(req, res) {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const user = await queries_1.db.createUser(walletAddress);
        const provision = await (0, provision_1.ensureGrailProvisionedUser)(user);
        if (provision.status === "failed") {
            res.status(502).json({
                success: false,
                error: `User GRAIL provisioning failed: ${provision.error}`,
            });
            return;
        }
        res.json({
            success: true,
            data: {
                status: provision.status,
                userId: provision.user.id,
                grailUserId: provision.user.grail_user_id,
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
