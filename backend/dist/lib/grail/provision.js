"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureGrailProvisionedUser = ensureGrailProvisionedUser;
const queries_1 = require("../../db/queries");
const user_1 = require("./user");
async function ensureGrailProvisionedUser(user) {
    if (user.grail_user_id) {
        return { status: "existing", user };
    }
    try {
        const { userId, userPda } = await (0, user_1.registerGrailUser)(user.wallet_address);
        await queries_1.db.updateGrailUser(user.id, userId, userPda);
        return {
            status: "created",
            user: {
                ...user,
                grail_user_id: userId,
                grail_user_pda: userPda,
            },
        };
    }
    catch (error) {
        return {
            status: "failed",
            user,
            error: error instanceof Error && error.message
                ? error.message
                : "Unknown GRAIL provisioning error",
        };
    }
}
