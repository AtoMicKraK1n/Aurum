"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPurchaseConfig = getPurchaseConfig;
const purchase_mode_1 = require("../../lib/purchase-mode");
async function getPurchaseConfig(_req, res) {
    const operatingMode = (0, purchase_mode_1.getPurchaseOperatingMode)();
    res.json({
        success: true,
        data: {
            operatingMode,
            selfCustodyEnabled: operatingMode === "self_custody",
        },
    });
}
