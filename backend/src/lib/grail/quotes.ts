import axios from "axios";
import { estimateGoldPurchase } from "./purchase";

const GRAIL_API = (
  process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app"
).replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;

export type BuyQuote = {
  usdcAmount: number;
  goldAmount: number;
  goldPricePerOunce: number;
  source: "grail_live" | "fallback_cache";
  stale: boolean;
  timestamp: string;
};

export type SellQuote = {
  goldAmount: number;
  usdcAmount: number;
  goldPricePerOunce: number;
  source: "grail_live" | "fallback_cache";
  stale: boolean;
  timestamp: string;
};

let lastBuyQuote: BuyQuote | null = null;
let lastSellQuote: SellQuote | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

export async function getBuyQuote(usdcAmount: number): Promise<BuyQuote> {
  try {
    const { goldAmount, goldPricePerOunce } = await estimateGoldPurchase(usdcAmount);
    const quote: BuyQuote = {
      usdcAmount,
      goldAmount,
      goldPricePerOunce,
      source: "grail_live",
      stale: false,
      timestamp: nowIso(),
    };
    lastBuyQuote = quote;
    return quote;
  } catch (error) {
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

export async function getSellQuote(goldAmount: number): Promise<SellQuote> {
  try {
    const response = await axios.post(
      `${GRAIL_API}/api/trading/estimate/sell`,
      { goldAmount },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": GRAIL_API_KEY,
        },
      },
    );

    const data = response.data?.data || {};
    const usdcAmount = Number(
      data.usdcAmount ?? data.maxUsdcAmount ?? data.quoteUsdcAmount ?? 0,
    );
    const goldPricePerOunce =
      Number(data.goldPricePerOunce) ||
      (goldAmount > 0 ? usdcAmount / goldAmount : 0);

    const quote: SellQuote = {
      goldAmount,
      usdcAmount,
      goldPricePerOunce,
      source: "grail_live",
      stale: false,
      timestamp: nowIso(),
    };
    lastSellQuote = quote;
    return quote;
  } catch (error) {
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
