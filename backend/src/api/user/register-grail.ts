import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse } from "../../types";
import { ensureGrailProvisionedUser } from "../../lib/grail/provision";

export async function registerUserInGrail(
  req: Request,
  res: Response<
    ApiResponse<{
      status: "existing" | "created";
      userId: string;
      grailUserId: string;
    }>
  >,
): Promise<void> {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
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

    res.json({
      success: true,
      data: {
        status: provision.status,
        userId: provision.user.id,
        grailUserId: provision.user.grail_user_id as string,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
