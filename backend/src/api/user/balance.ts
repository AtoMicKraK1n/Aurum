import { Request, Response } from "express";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { db } from "../../db/queries";
import { getGrailUserBalance } from "../../lib/grail/user";
import { ApiResponse } from "../../types";
import { ensureGrailProvisionedUser } from "../../lib/grail/provision";

const connection = new Connection(process.env.SOLANA_RPC_URL!);

export async function getUserBalance(
  req: Request,
  res: Response<
    ApiResponse<{
      balances: {
        sol: number;
        gold: number;
        onChainGrailGold: number;
      };
    }>
  >,
): Promise<void> {
  try {
    const { walletAddress } = req.query;

    if (!walletAddress || typeof walletAddress !== "string") {
      res.status(400).json({ success: false, error: "walletAddress required" });
      return;
    }

    const user = await db.createUser(walletAddress);

    const pubkey = new PublicKey(walletAddress);
    const lamports = await connection.getBalance(pubkey);
    const solBalance = lamports / LAMPORTS_PER_SOL;

    // Custodial ledger gold distributed by batch jobs.
    const goldBalance = await db.getGoldBalance(user.id);

    // Auto-provision GRAIL linkage for existing app users that missed initial registration.
    let linkedUser = user;
    if (!linkedUser.grail_user_id) {
      const provision = await ensureGrailProvisionedUser(user);
      if (provision.status !== "failed") {
        linkedUser = provision.user;
      } else {
        console.warn(
          `GRAIL provisioning skipped in balance API for user ${user.id}: ${provision.error}`,
        );
      }
    }

    // Optional on-chain GRAIL user account balance (can differ in custodial flow).
    let onChainGrailGold = 0;
    if (linkedUser.grail_user_id) {
      onChainGrailGold = await getGrailUserBalance(linkedUser.grail_user_id);
    }

    res.json({
      success: true,
      data: {
        balances: {
          sol: solBalance,
          gold: goldBalance,
          onChainGrailGold,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}
