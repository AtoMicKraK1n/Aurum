"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBatchNow = runBatchNow;
const converter_1 = require("../../lib/batch/converter");
const queries_1 = require("../../db/queries");
let isBatchRunning = false;
async function runBatchNow(req, res) {
    const adminKey = process.env.ADMIN_API_KEY;
    const providedKey = req.header("x-admin-key");
    if (!adminKey) {
        res.status(500).json({
            success: false,
            error: "ADMIN_API_KEY is not configured",
        });
        return;
    }
    if (!providedKey || providedKey !== adminKey) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
    }
    if (isBatchRunning) {
        res.status(409).json({
            success: false,
            error: "Batch is already running",
        });
        return;
    }
    isBatchRunning = true;
    let lockAcquired = false;
    try {
        lockAcquired = await queries_1.db.acquireBatchLock();
        if (!lockAcquired) {
            res.status(409).json({
                success: false,
                error: "Batch is already running (global lock active)",
            });
            return;
        }
        const result = await (0, converter_1.runBatchConversion)();
        res.json({ success: true, data: result });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
    finally {
        if (lockAcquired) {
            await queries_1.db.releaseBatchLock().catch((releaseError) => {
                console.error("Failed to release batch lock:", releaseError);
            });
        }
        isBatchRunning = false;
    }
}
