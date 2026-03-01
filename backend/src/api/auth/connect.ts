import { Request, Response } from "express";
import { db } from "../../db/queries";
import { registerGrailUser } from "../../lib/grail/user";
import { ApiResponse, User } from "../../types";
import { verifyWalletSignature } from "../../lib/auth/wallet-signature";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unexpected server error";
}

export async function connectWallet(
  req: Request,
  res: Response<ApiResponse<{ user: User; isNewUser: boolean }>>,
): Promise<void> {
  try {
    const { walletAddress, nonce, signature } = req.body;

    if (!walletAddress) {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }
    if (!nonce || !signature) {
      res
        .status(400)
        .json({ success: false, error: "nonce and signature are required" });
      return;
    }

    const nonceRecord = await db.getValidWalletAuthNonce(walletAddress, nonce);
    if (!nonceRecord) {
      res.status(401).json({ success: false, error: "Invalid or expired nonce" });
      return;
    }

    const isValidSignature = verifyWalletSignature({
      walletAddress,
      nonce,
      signatureBase58: signature,
    });
    if (!isValidSignature) {
      res.status(401).json({ success: false, error: "Invalid wallet signature" });
      return;
    }

    await db.markWalletAuthNonceUsed(nonceRecord.id);

    console.log(`🔌 Wallet connecting: ${walletAddress}`);

    // Create/get user
    console.log("Checking/creating user in database...");
    const user = await db.createUser(walletAddress);
    console.log(`Database user ready: ${user.id}`);

    // Register in GRAIL
    if (!user.grail_user_id) {
      console.log("🆕 New user - registering in GRAIL...");

      try {
        const { userId, userPda } = await registerGrailUser(walletAddress);

        await db.updateGrailUser(user.id, userId, userPda);

        console.log(`✅ User registered in GRAIL: ${userId}`);

        res.json({
          success: true,
          data: {
            user: {
              ...user,
              grail_user_id: userId,
              grail_user_pda: userPda,
            },
            isNewUser: true,
          },
        });
        return;
      } catch (grailError) {
        console.error("❌ GRAIL registration failed:", grailError);

        res.json({
          success: true,
          data: {
            user,
            isNewUser: true,
          },
        });
        return;
      }
    }

    console.log(`✅ Existing user: ${user.grail_user_id}`);

    res.json({
      success: true,
      data: {
        user,
        isNewUser: false,
      },
    });
  } catch (error) {
    console.error("connectWallet failed:", error);
    res.status(500).json({
      success: false,
      error: formatErrorMessage(error),
    });
  }
}
