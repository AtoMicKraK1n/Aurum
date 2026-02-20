import { Request, Response } from "express";
import { db } from "../../db/queries";
import { registerGrailUser } from "../../lib/grail/user";
import { ApiResponse, User } from "../../types";

export async function connectWallet(
  req: Request,
  res: Response<ApiResponse<{ user: User; isNewUser: boolean }>>,
): Promise<void> {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    console.log(`🔌 Wallet connecting: ${walletAddress}`);

    // Create/get user
    const user = await db.createUser(walletAddress);
    const isNewUser = !user.grail_user_id;

    // Register in GRAIL
    if (!user.grail_user_id) {
      console.log("🆕 New user - registering in GRAIL...");

      try {
        const { userId, userPda, txSignature } =
          await registerGrailUser(walletAddress);

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
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
