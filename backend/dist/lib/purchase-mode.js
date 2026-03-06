"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPurchaseOperatingMode = getPurchaseOperatingMode;
exports.isSelfCustodyEnabled = isSelfCustodyEnabled;
function getPurchaseOperatingMode() {
    const raw = (process.env.PURCHASE_OPERATING_MODE || "").trim().toLowerCase();
    if (raw === "self_custody" || raw === "self-custody" || raw === "self") {
        return "self_custody";
    }
    // TODO(2026-03-31): Remove custodial fallback and enforce self_custody only.
    return "self_custody";
}
function isSelfCustodyEnabled() {
    return getPurchaseOperatingMode() === "self_custody";
}
