import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";

export async function getDustStatus(
  req: Request,
  res: Response<
    ApiResponse<{ pendingAmount: number; queueCount: number; status: string }>
  >,
): Promise<void> {
  try {
    const { walletAddress } = req.query;

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    const user = await db.getUserByWallet(walletAddress);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const userPending = await db.getUserPendingDust(user.id);
    const totalPending = userPending.reduce((sum, d) => sum + d.sol_amount, 0);

    res.json({
      success: true,
      data: {
        pendingAmount: totalPending,
        queueCount: userPending.length,
        status: userPending.length > 0 ? "pending" : "none",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
