import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";
import { submitSignedSelfCustodyTransaction } from "../../lib/grail/purchase";

export async function submitSelfPurchase(
  req: Request,
  res: Response<
    ApiResponse<{
      tradeId: string;
      txSignature: string;
      status: "completed";
    }>
  >,
): Promise<void> {
  try {
    const { tradeId, signedSerializedTx } = req.body;

    if (!tradeId || !signedSerializedTx) {
      res.status(400).json({
        success: false,
        error: "tradeId and signedSerializedTx are required",
      });
      return;
    }

    const trade = await db.getSelfCustodyTradeById(tradeId);
    if (!trade) {
      res.status(404).json({ success: false, error: "Trade not found" });
      return;
    }

    if (trade.status !== "pending") {
      res.status(409).json({
        success: false,
        error: `Trade already ${trade.status}`,
      });
      return;
    }

    try {
      const txSignature =
        await submitSignedSelfCustodyTransaction(signedSerializedTx);

      await db.completeSelfCustodyTrade({
        tradeId,
        signedSerializedTx,
        submittedTxSignature: txSignature,
      });

      res.json({
        success: true,
        data: {
          tradeId,
          txSignature,
          status: "completed",
        },
      });
    } catch (error) {
      await db.failSelfCustodyTrade(tradeId, (error as Error).message);
      throw error;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
