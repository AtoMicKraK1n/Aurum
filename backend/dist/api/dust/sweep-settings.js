"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDustSweepSettings = getDustSweepSettings;
exports.upsertDustSweepSettings = upsertDustSweepSettings;
const queries_1 = require("../../db/queries");
const DEFAULT_SWEEP_SETTINGS = {
    enabled: false,
    minSweepUsdc: 1,
    maxSweepUsdc: 25,
    slippagePercent: 20,
    cooldownMinutes: 30,
};
function toSettingsResponse(input) {
    return {
        enabled: input.enabled,
        minSweepUsdc: Number(input.minSweepUsdc),
        maxSweepUsdc: Number(input.maxSweepUsdc),
        slippagePercent: Number(input.slippagePercent),
        cooldownMinutes: Number(input.cooldownMinutes),
        updatedAt: input.updatedAt.toISOString(),
    };
}
async function getDustSweepSettings(req, res) {
    try {
        const { walletAddress } = req.query;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        const user = await queries_1.db.createUser(walletAddress);
        const settings = await queries_1.db.getDustSweepSettings(user.id);
        if (!settings) {
            const created = await queries_1.db.upsertDustSweepSettings({
                userId: user.id,
                enabled: DEFAULT_SWEEP_SETTINGS.enabled,
                minSweepUsdc: DEFAULT_SWEEP_SETTINGS.minSweepUsdc,
                maxSweepUsdc: DEFAULT_SWEEP_SETTINGS.maxSweepUsdc,
                slippagePercent: DEFAULT_SWEEP_SETTINGS.slippagePercent,
                cooldownMinutes: DEFAULT_SWEEP_SETTINGS.cooldownMinutes,
            });
            res.json({
                success: true,
                data: toSettingsResponse({
                    enabled: created.enabled,
                    minSweepUsdc: created.min_sweep_usdc,
                    maxSweepUsdc: created.max_sweep_usdc,
                    slippagePercent: created.slippage_percent,
                    cooldownMinutes: created.cooldown_minutes,
                    updatedAt: created.updated_at,
                }),
            });
            return;
        }
        res.json({
            success: true,
            data: toSettingsResponse({
                enabled: settings.enabled,
                minSweepUsdc: settings.min_sweep_usdc,
                maxSweepUsdc: settings.max_sweep_usdc,
                slippagePercent: settings.slippage_percent,
                cooldownMinutes: settings.cooldown_minutes,
                updatedAt: settings.updated_at,
            }),
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
async function upsertDustSweepSettings(req, res) {
    try {
        const { walletAddress, enabled, minSweepUsdc, maxSweepUsdc, slippagePercent, cooldownMinutes, } = req.body;
        if (!walletAddress || typeof walletAddress !== "string") {
            res.status(400).json({ success: false, error: "walletAddress required" });
            return;
        }
        if (typeof enabled !== "boolean") {
            res.status(400).json({ success: false, error: "enabled must be boolean" });
            return;
        }
        if (typeof minSweepUsdc !== "number" ||
            !Number.isFinite(minSweepUsdc) ||
            minSweepUsdc <= 0) {
            res.status(400).json({
                success: false,
                error: "minSweepUsdc must be a positive number",
            });
            return;
        }
        if (typeof maxSweepUsdc !== "number" ||
            !Number.isFinite(maxSweepUsdc) ||
            maxSweepUsdc <= 0) {
            res.status(400).json({
                success: false,
                error: "maxSweepUsdc must be a positive number",
            });
            return;
        }
        if (maxSweepUsdc < minSweepUsdc) {
            res.status(400).json({
                success: false,
                error: "maxSweepUsdc must be greater than or equal to minSweepUsdc",
            });
            return;
        }
        if (typeof slippagePercent !== "number" ||
            !Number.isFinite(slippagePercent) ||
            slippagePercent < 0 ||
            slippagePercent > 100) {
            res.status(400).json({
                success: false,
                error: "slippagePercent must be between 0 and 100",
            });
            return;
        }
        if (typeof cooldownMinutes !== "number" ||
            !Number.isFinite(cooldownMinutes) ||
            cooldownMinutes < 0 ||
            cooldownMinutes > 24 * 60) {
            res.status(400).json({
                success: false,
                error: "cooldownMinutes must be between 0 and 1440",
            });
            return;
        }
        const user = await queries_1.db.createUser(walletAddress);
        const saved = await queries_1.db.upsertDustSweepSettings({
            userId: user.id,
            enabled,
            minSweepUsdc,
            maxSweepUsdc,
            slippagePercent,
            cooldownMinutes,
        });
        res.json({
            success: true,
            data: toSettingsResponse({
                enabled: saved.enabled,
                minSweepUsdc: saved.min_sweep_usdc,
                maxSweepUsdc: saved.max_sweep_usdc,
                slippagePercent: saved.slippage_percent,
                cooldownMinutes: saved.cooldown_minutes,
                updatedAt: saved.updated_at,
            }),
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
