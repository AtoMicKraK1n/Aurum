import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse, DustQueue } from "../../types";

export async function queueDust(
  req: Request,
  res: Response<ApiResponse<{ queue: DustQueue; message: string }>>,
): Promise<void> {
  try {
    const { walletAddress, usdcAmount } = req.body;

    if (!walletAddress || usdcAmount === undefined) {
      res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
      return;
    }

    if (typeof usdcAmount !== "number" || !Number.isFinite(usdcAmount)) {
      res.status(400).json({
        success: false,
        error: "usdcAmount must be a valid number",
      });
      return;
    }

    if (usdcAmount <= 0) {
      res
        .status(400)
        .json({ success: false, error: "Amount must be positive" });
      return;
    }

    const user = await db.getUserByWallet(walletAddress);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const queue = await db.queueDust(user.id, usdcAmount);

    res.json({
      success: true,
      data: {
        queue,
        message: "Dust queued for next batch (within 24hrs)",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
