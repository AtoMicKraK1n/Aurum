"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteBuy = quoteBuy;
const quotes_1 = require("../../lib/grail/quotes");
async function quoteBuy(req, res) {
    try {
        const usdcAmount = Number(req.query.usdcAmount);
        if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) {
            res.status(400).json({
                success: false,
                error: "usdcAmount must be a positive number",
            });
            return;
        }
        const quote = await (0, quotes_1.getBuyQuote)(usdcAmount);
        res.json({ success: true, data: quote });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
