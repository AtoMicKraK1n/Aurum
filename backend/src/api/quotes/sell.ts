import { Request, Response } from "express";
import { ApiResponse } from "../../types";
import { getSellQuote } from "../../lib/grail/quotes";

export async function quoteSell(
  req: Request,
  res: Response<
    ApiResponse<{
      goldAmount: number;
      usdcAmount: number;
      goldPricePerOunce: number;
      source: "grail_live" | "fallback_cache";
      stale: boolean;
      timestamp: string;
    }>
  >,
): Promise<void> {
  try {
    const goldAmount = Number(req.query.goldAmount);
    if (!Number.isFinite(goldAmount) || goldAmount <= 0) {
      res.status(400).json({
        success: false,
        error: "goldAmount must be a positive number",
      });
      return;
    }

    const quote = await getSellQuote(goldAmount);
    res.json({ success: true, data: quote });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
