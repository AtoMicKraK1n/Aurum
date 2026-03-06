import { Connection, PublicKey } from "@solana/web3.js";
import { db } from "../../db/queries";
import { ensureGrailProvisionedUser } from "../grail/provision";
import { createSelfCustodyPurchaseIntent } from "../grail/purchase";
import { isSelfCustodyEnabled } from "../purchase-mode";

const DEFAULT_DEVNET_USDC_MINT = "8METbBgV5CSyorAaW5Lm42dbWdE8JU9vfBiM67TK9Mp4";

const connection = new Connection(process.env.SOLANA_RPC_URL!);

function getSweepUsdcMint(): string {
  return process.env.DUST_SWEEP_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;
}

async function getWalletTokenBalance(
  walletAddress: string,
  mintAddress: string,
): Promise<number> {
  const ownerPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(mintAddress);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    ownerPubkey,
    { mint: mintPubkey },
  );

  let balance = 0;
  for (const tokenAccount of tokenAccounts.value) {
    const parsedInfo = tokenAccount.account.data.parsed?.info;
    const amount = Number(parsedInfo?.tokenAmount?.uiAmount || 0);
    if (Number.isFinite(amount) && amount > 0) {
      balance += amount;
    }
  }

  return balance;
}

function isCooldownActive(lastRunAt: Date, cooldownMinutes: number): boolean {
  if (cooldownMinutes <= 0) {
    return false;
  }
  const nextEligibleAt =
    new Date(lastRunAt).getTime() + cooldownMinutes * 60 * 1000;
  return Date.now() < nextEligibleAt;
}

export async function runDustSweepCycle(): Promise<{
  checkedUsers: number;
  intentCreated: number;
}> {
  if (!isSelfCustodyEnabled()) {
    return { checkedUsers: 0, intentCreated: 0 };
  }

  const users = await db.getEnabledDustSweepUsers();
  const sweepMint = getSweepUsdcMint();
  let intentCreated = 0;

  for (const row of users) {
    const minSweep = Number(row.min_sweep_usdc);
    const maxSweep = Number(row.max_sweep_usdc);
    const slippagePercent = Number(row.slippage_percent);
    const cooldownMinutes = Number(row.cooldown_minutes);

    if (
      !Number.isFinite(minSweep) ||
      !Number.isFinite(maxSweep) ||
      minSweep <= 0 ||
      maxSweep <= 0 ||
      maxSweep < minSweep
    ) {
      continue;
    }

    try {
      const latestRun = await db.getLatestDustSweepRun(row.user_id);
      if (
        latestRun &&
        isCooldownActive(latestRun.created_at, cooldownMinutes)
      ) {
        continue;
      }

      const hasPendingTrade = await db.hasPendingSelfCustodyTrade(row.user_id);
      if (hasPendingTrade) {
        continue;
      }

      const walletBalance = await getWalletTokenBalance(
        row.wallet_address,
        sweepMint,
      );
      if (walletBalance < minSweep) {
        continue;
      }

      const sweepAmount = Math.min(walletBalance, maxSweep);

      const run = await db.createDustSweepRun({
        userId: row.user_id,
        status: "queued",
        triggerAmountUsdc: walletBalance,
        sweepAmountUsdc: sweepAmount,
        metadata: {
          source: "cron",
          mint: sweepMint,
          reason: "threshold_reached",
        },
      });

      const user = await db.getUserByWallet(row.wallet_address);
      if (!user) {
        await db.updateDustSweepRun(run.id, {
          status: "failed",
          errorMessage: "User not found",
        });
        continue;
      }

      const provision = await ensureGrailProvisionedUser(user);
      if (provision.status === "failed" || !provision.user.grail_user_id) {
        await db.updateDustSweepRun(run.id, {
          status: "failed",
          errorMessage:
            provision.status === "failed"
              ? provision.error
              : "Missing grail_user_id",
        });
        continue;
      }

      const intent = await createSelfCustodyPurchaseIntent(
        provision.user.grail_user_id,
        sweepAmount,
        slippagePercent,
        false,
        true,
      );

      const trade = await db.createSelfCustodyTrade({
        userId: row.user_id,
        grailUserId: provision.user.grail_user_id,
        usdcAmount: sweepAmount,
        estimatedGoldAmount: intent.goldAmount,
        maxUsdcAmount: intent.maxUsdcAmount,
        serializedTx: intent.serializedTx,
      });

      await db.updateDustSweepRun(run.id, {
        status: "intent_created",
        tradeId: trade.id,
        metadata: {
          source: "cron",
          mint: sweepMint,
          reason: "threshold_reached",
          signingInstructions: intent.signingInstructions || null,
          intentStatus: intent.status || "pending",
        },
      });
      intentCreated += 1;
    } catch (error) {
      console.error(
        `[dust-sweep] user=${row.user_id} wallet=${row.wallet_address} failed:`,
        error,
      );
      // Non-fatal per user; continue processing others.
    }
  }

  return { checkedUsers: users.length, intentCreated };
}
