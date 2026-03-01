import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";
import { createAuthNonce, getAuthMessage } from "../../lib/auth/wallet-signature";

type AuthNonceData = {
  nonce: string;
  message: string;
  expiresAt: string;
};

export async function createAuthNonceChallenge(
  req: Request,
  res: Response<ApiResponse<AuthNonceData>>,
): Promise<void> {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    const nonce = createAuthNonce();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.createWalletAuthNonce(walletAddress, nonce, expiresAt);

    res.json({
      success: true,
      data: {
        nonce,
        message: getAuthMessage(walletAddress, nonce),
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("createAuthNonceChallenge failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
}
