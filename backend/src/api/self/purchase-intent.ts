import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse, SelfCustodyTrade } from "../../types";
import { createSelfCustodyPurchaseIntent } from "../../lib/grail/purchase";
import { isSelfCustodyEnabled } from "../../lib/purchase-mode";
import { ensureGrailProvisionedUser } from "../../lib/grail/provision";
import { registerGrailUser } from "../../lib/grail/user";

function isGrailUserNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes("User not found") ||
    error.message.includes('"error":"User not found"')
  );
}

export async function createSelfPurchaseIntent(
  req: Request,
  res: Response<
    ApiResponse<{
      trade: SelfCustodyTrade;
      serializedTx: string;
      signingInstructions?: unknown;
      status?: string;
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

    const {
      walletAddress,
      usdcAmount,
      slippagePercent,
      cosign,
      co_sign,
      userAsFeePayer,
      userAsfeepayer,
    } = req.body;

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

    const user = await db.createUser(walletAddress);

    const provision = await ensureGrailProvisionedUser(user);
    if (provision.status === "failed") {
      res.status(502).json({
        success: false,
        error: `User GRAIL provisioning failed: ${provision.error}`,
      });
      return;
    }
    let linkedUser = provision.user;

    const resolvedSlippagePercent =
      typeof slippagePercent === "number" ? slippagePercent : 5;
    const resolvedCosign =
      typeof cosign === "boolean"
        ? cosign
        : typeof co_sign === "boolean"
          ? co_sign
          : false;
    const resolvedUserAsFeePayer =
      typeof userAsFeePayer === "boolean"
        ? userAsFeePayer
        : typeof userAsfeepayer === "boolean"
          ? userAsfeepayer
          : true;

    let intent;
    try {
      intent = await createSelfCustodyPurchaseIntent(
        linkedUser.grail_user_id as string,
        usdcAmount,
        resolvedSlippagePercent,
        resolvedCosign,
        resolvedUserAsFeePayer,
      );
    } catch (error) {
      if (!isGrailUserNotFoundError(error)) {
        throw error;
      }

      console.warn(
        `Stale grail_user_id detected for user ${linkedUser.id}. Re-provisioning...`,
      );
      const reprovisioned = await registerGrailUser(linkedUser.wallet_address);
      await db.updateGrailUser(
        linkedUser.id,
        reprovisioned.userId,
        reprovisioned.userPda,
      );

      linkedUser = {
        ...linkedUser,
        grail_user_id: reprovisioned.userId,
        grail_user_pda: reprovisioned.userPda,
      };

      intent = await createSelfCustodyPurchaseIntent(
        linkedUser.grail_user_id as string,
        usdcAmount,
        resolvedSlippagePercent,
        resolvedCosign,
        resolvedUserAsFeePayer,
      );
    }

    const trade = await db.createSelfCustodyTrade({
      userId: linkedUser.id,
      grailUserId: linkedUser.grail_user_id as string,
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
        signingInstructions: intent.signingInstructions,
        status: intent.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
