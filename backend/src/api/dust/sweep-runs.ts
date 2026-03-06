import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";

type DustSweepRunResponse = {
  id: string;
  status: "queued" | "intent_created" | "signed" | "submitted" | "failed" | "skipped";
  triggerAmountUsdc: number;
  sweepAmountUsdc: number;
  tradeId?: string;
  txSignature?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function listDustSweepRuns(
  req: Request,
  res: Response<ApiResponse<{ runs: DustSweepRunResponse[] }>>,
): Promise<void> {
  try {
    const { walletAddress, limit } = req.query;

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    const parsedLimit =
      typeof limit === "string" ? Number.parseInt(limit, 10) : 20;
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 20;

    const user = await db.createUser(walletAddress);
    const runs = await db.listDustSweepRuns(user.id, safeLimit);

    res.json({
      success: true,
      data: {
        runs: runs.map((run) => ({
          id: run.id,
          status: run.status,
          triggerAmountUsdc: Number(run.trigger_amount_usdc),
          sweepAmountUsdc: Number(run.sweep_amount_usdc),
          tradeId: run.trade_id,
          txSignature: run.tx_signature,
          errorMessage: run.error_message,
          metadata: run.metadata,
          createdAt: run.created_at.toISOString(),
          updatedAt: run.updated_at.toISOString(),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
