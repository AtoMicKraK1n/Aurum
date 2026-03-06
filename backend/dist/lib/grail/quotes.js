"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuyQuote = getBuyQuote;
exports.getSellQuote = getSellQuote;
const axios_1 = __importDefault(require("axios"));
const purchase_1 = require("./purchase");
const GRAIL_API = (process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app").replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;
let lastBuyQuote = null;
let lastSellQuote = null;
function nowIso() {
    return new Date().toISOString();
}
async function getBuyQuote(usdcAmount) {
    try {
        const { goldAmount, goldPricePerOunce } = await (0, purchase_1.estimateGoldPurchase)(usdcAmount);
        const quote = {
            usdcAmount,
            goldAmount,
            goldPricePerOunce,
            source: "grail_live",
            stale: false,
            timestamp: nowIso(),
        };
        lastBuyQuote = quote;
        return quote;
    }
    catch (error) {
        if (lastBuyQuote) {
            return {
                ...lastBuyQuote,
                usdcAmount,
                source: "fallback_cache",
                stale: true,
            };
        }
        throw error;
    }
}
async function getSellQuote(goldAmount) {
    try {
        const response = await axios_1.default.post(`${GRAIL_API}/api/trading/estimate/sell`, { goldAmount }, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
        });
        const data = response.data?.data || {};
        const usdcAmount = Number(data.usdcAmount ?? data.maxUsdcAmount ?? data.quoteUsdcAmount ?? 0);
        const goldPricePerOunce = Number(data.goldPricePerOunce) ||
            (goldAmount > 0 ? usdcAmount / goldAmount : 0);
        const quote = {
            goldAmount,
            usdcAmount,
            goldPricePerOunce,
            source: "grail_live",
            stale: false,
            timestamp: nowIso(),
        };
        lastSellQuote = quote;
        return quote;
    }
    catch (error) {
        if (lastSellQuote) {
            return {
                ...lastSellQuote,
                goldAmount,
                source: "fallback_cache",
                stale: true,
            };
        }
        throw error;
    }
}
