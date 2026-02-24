import { Request, Response } from "express";
import { runBatchConversion } from "../../lib/batch/converter";
import { ApiResponse } from "../../types";

let isBatchRunning = false;

export async function runBatchNow(
  req: Request,
  res: Response<
    ApiResponse<{
      batchId: string;
      totalUsdc: number;
      totalGold: number;
      usersProcessed: number;
    }>
  >,
): Promise<void> {
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.header("x-admin-key");

  if (!adminKey) {
    res.status(500).json({
      success: false,
      error: "ADMIN_API_KEY is not configured",
    });
    return;
  }

  if (!providedKey || providedKey !== adminKey) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  if (isBatchRunning) {
    res.status(409).json({
      success: false,
      error: "Batch is already running",
    });
    return;
  }

  isBatchRunning = true;
  try {
    const result = await runBatchConversion();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  } finally {
    isBatchRunning = false;
  }
}
