import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";
import { submitSignedSelfCustodyTransaction } from "../../lib/grail/purchase";
import { isSelfCustodyEnabled } from "../../lib/purchase-mode";

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
    if (!isSelfCustodyEnabled()) {
      res.status(409).json({
        success: false,
        error:
          "Self-custody purchases are disabled (PURCHASE_OPERATING_MODE=custodial). Use deposit intent + batch flow.",
      });
      return;
    }

    const { tradeId, signedSerializedTx, signedTransaction } = req.body;
    const signedPayload =
      typeof signedSerializedTx === "string" && signedSerializedTx.length > 0
        ? signedSerializedTx
        : typeof signedTransaction === "string" && signedTransaction.length > 0
          ? signedTransaction
          : "";

    if (!tradeId || !signedPayload) {
      res.status(400).json({
        success: false,
        error:
          "tradeId and signedSerializedTx (or signedTransaction) are required",
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
        await submitSignedSelfCustodyTransaction(signedPayload);

      await db.completeSelfCustodyTrade({
        tradeId,
        signedSerializedTx: signedPayload,
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
