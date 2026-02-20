import { Request, Response } from "express";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { db } from "../../db/queries";
import { ApiResponse, DustQueue } from "../../types";

export async function queueDust(
  req: Request,
  res: Response<ApiResponse<{ queue: DustQueue; message: string }>>,
): Promise<void> {
  try {
    const { walletAddress, solAmount } = req.body;

    if (!walletAddress || !solAmount) {
      res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
      return;
    }

    if (solAmount <= 0) {
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

    const solLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const queue = await db.queueDust(user.id, solAmount, solLamports);

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
