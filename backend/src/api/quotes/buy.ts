import { Request, Response } from "express";
import { ApiResponse } from "../../types";
import { getBuyQuote } from "../../lib/grail/quotes";

export async function quoteBuy(
  req: Request,
  res: Response<
    ApiResponse<{
      usdcAmount: number;
      goldAmount: number;
      goldPricePerOunce: number;
      source: "grail_live" | "fallback_cache";
      stale: boolean;
      timestamp: string;
    }>
  >,
): Promise<void> {
  try {
    const usdcAmount = Number(req.query.usdcAmount);
    if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) {
      res.status(400).json({
        success: false,
        error: "usdcAmount must be a positive number",
      });
      return;
    }

    const quote = await getBuyQuote(usdcAmount);
    res.json({ success: true, data: quote });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
