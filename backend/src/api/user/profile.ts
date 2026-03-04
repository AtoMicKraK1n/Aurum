import { Request, Response } from "express";
import { db } from "../../db/queries";
import { ApiResponse, User } from "../../types";

export async function getUserProfile(
  req: Request,
  res: Response<
    ApiResponse<{
      exists: boolean;
      grailLinked: boolean;
      user?: User;
    }>
  >,
): Promise<void> {
  try {
    const { walletAddress } = req.query;
    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    const user = await db.getUserByWallet(walletAddress);
    if (!user) {
      res.json({
        success: true,
        data: {
          exists: false,
          grailLinked: false,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        exists: true,
        grailLinked: Boolean(user.grail_user_id),
        user,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
