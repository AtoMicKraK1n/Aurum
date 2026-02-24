import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse, DustQueue } from "../../types";
import { verifyUsdcDeposit } from "../../lib/solana/deposit";

export async function confirmDeposit(
  req: Request,
  res: Response<
    ApiResponse<{
      queue: DustQueue;
      txSignature: string;
      receivedUsdcAmount: number;
    }>
  >,
): Promise<void> {
  try {
    const { intentId, txSignature } = req.body;

    if (!intentId || !txSignature) {
      res.status(400).json({
        success: false,
        error: "intentId and txSignature are required",
      });
      return;
    }

    const intent = await db.getDepositIntentById(intentId);
    if (!intent) {
      res.status(404).json({ success: false, error: "Deposit intent not found" });
      return;
    }

    if (intent.status !== "pending") {
      res.status(409).json({
        success: false,
        error: `Deposit intent already ${intent.status}`,
      });
      return;
    }

    const now = new Date();
    if (new Date(intent.expires_at) < now) {
      await db.markDepositIntentStatus(intent.id, "expired");
      res.status(410).json({ success: false, error: "Deposit intent expired" });
      return;
    }

    const verification = await verifyUsdcDeposit({
      txSignature,
      expectedUsdcAmount: Number(intent.expected_usdc_amount),
      senderWallet: intent.wallet_address,
    });

    await db.markDepositIntentConfirmed(intent.id, txSignature);
    const queue = await db.queueDust(intent.user_id, Number(intent.expected_usdc_amount));
    await db.createDustDepositTransaction(
      intent.user_id,
      Number(intent.expected_usdc_amount),
      txSignature,
    );

    res.json({
      success: true,
      data: {
        queue,
        txSignature,
        receivedUsdcAmount: verification.receivedUsdcAmount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
