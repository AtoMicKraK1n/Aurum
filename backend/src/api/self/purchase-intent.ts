import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse, SelfCustodyTrade } from "../../types";
import { createSelfCustodyPurchaseIntent } from "../../lib/grail/purchase";

export async function createSelfPurchaseIntent(
  req: Request,
  res: Response<
    ApiResponse<{
      trade: SelfCustodyTrade;
      serializedTx: string;
    }>
  >,
): Promise<void> {
  try {
    const { walletAddress, usdcAmount, slippagePercent } = req.body;

    if (!walletAddress || usdcAmount === undefined) {
      res.status(400).json({
        success: false,
        error: "walletAddress and usdcAmount are required",
      });
      return;
    }

    if (typeof usdcAmount !== "number" || !Number.isFinite(usdcAmount) || usdcAmount <= 0) {
      res
        .status(400)
        .json({ success: false, error: "usdcAmount must be a positive number" });
      return;
    }

    const user = await db.getUserByWallet(walletAddress);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    if (!user.grail_user_id) {
      res.status(409).json({
        success: false,
        error: "User is not linked to GRAIL",
      });
      return;
    }

    const intent = await createSelfCustodyPurchaseIntent(
      user.grail_user_id,
      usdcAmount,
      typeof slippagePercent === "number" ? slippagePercent : 5,
    );

    const trade = await db.createSelfCustodyTrade({
      userId: user.id,
      grailUserId: user.grail_user_id,
      usdcAmount,
      estimatedGoldAmount: intent.goldAmount,
      maxUsdcAmount: intent.maxUsdcAmount,
      serializedTx: intent.serializedTx,
    });

    res.json({
      success: true,
      data: {
        trade,
        serializedTx: intent.serializedTx,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
