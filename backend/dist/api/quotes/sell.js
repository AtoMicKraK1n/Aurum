"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteSell = quoteSell;
const quotes_1 = require("../../lib/grail/quotes");
async function quoteSell(req, res) {
    try {
        const goldAmount = Number(req.query.goldAmount);
        if (!Number.isFinite(goldAmount) || goldAmount <= 0) {
            res.status(400).json({
                success: false,
                error: "goldAmount must be a positive number",
            });
            return;
        }
        const quote = await (0, quotes_1.getSellQuote)(goldAmount);
        res.json({ success: true, data: quote });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
