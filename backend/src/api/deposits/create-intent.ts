import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";

const DEFAULT_INTENT_EXPIRY_MINUTES = 30;
const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function createDepositIntent(
  req: Request,
  res: Response<
    ApiResponse<{
      intentId: string;
      recipientWallet: string;
      usdcMint: string;
      expectedUsdcAmount: number;
      expiresAt: string;
    }>
  >,
): Promise<void> {
  try {
    const { walletAddress, usdcAmount } = req.body;

    if (!walletAddress || usdcAmount === undefined) {
      res.status(400).json({ success: false, error: "Missing required fields" });
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

    const expiryMinutes = Number(
      process.env.DEPOSIT_INTENT_EXPIRY_MINUTES || DEFAULT_INTENT_EXPIRY_MINUTES,
    );
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
    const intent = await db.createDepositIntent(
      user.id,
      walletAddress,
      usdcAmount,
      expiresAt,
    );

    res.json({
      success: true,
      data: {
        intentId: intent.id,
        recipientWallet: getRequiredEnv("TREASURY_WALLET_ADDRESS"),
        usdcMint: process.env.USDC_MINT || DEFAULT_USDC_MINT,
        expectedUsdcAmount: Number(intent.expected_usdc_amount),
        expiresAt: intent.expires_at.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
