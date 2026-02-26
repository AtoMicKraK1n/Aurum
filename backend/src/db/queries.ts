import { pool } from "./client";
import {
  User,
  DustQueue,
  GoldBalance,
  DepositIntent,
  SelfCustodyTrade,
} from "../types";

const BATCH_LOCK_KEY = 7249001;

export const db = {
  async acquireBatchLock(): Promise<boolean> {
    const { rows } = await pool.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [BATCH_LOCK_KEY],
    );
    return !!rows[0]?.locked;
  },

  async releaseBatchLock(): Promise<void> {
    await pool.query("SELECT pg_advisory_unlock($1)", [BATCH_LOCK_KEY]);
  },

  async createUser(walletAddress: string): Promise<User> {
    const { rows } = await pool.query<User>(
      `INSERT INTO users (wallet_address) 
       VALUES ($1) 
       ON CONFLICT (wallet_address) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`,
      [walletAddress],
    );
    return rows[0];
  },

  async getUserByWallet(walletAddress: string): Promise<User | null> {
    const { rows } = await pool.query<User>(
      "SELECT * FROM users WHERE wallet_address = $1",
      [walletAddress],
    );
    return rows[0] || null;
  },

  async queueDust(
    userId: string,
    usdcAmount: number,
  ): Promise<DustQueue> {
    const { rows } = await pool.query<DustQueue>(
      "INSERT INTO dust_queue (user_id, usdc_amount) VALUES ($1, $2) RETURNING *",
      [userId, usdcAmount],
    );
    return rows[0];
  },

  async createDepositIntent(
    userId: string,
    walletAddress: string,
    expectedUsdcAmount: number,
    expiresAt: Date,
  ): Promise<DepositIntent> {
    const { rows } = await pool.query<DepositIntent>(
      `INSERT INTO deposit_intents (user_id, wallet_address, expected_usdc_amount, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, walletAddress, expectedUsdcAmount, expiresAt.toISOString()],
    );
    return rows[0];
  },

  async getDepositIntentById(intentId: string): Promise<DepositIntent | null> {
    const { rows } = await pool.query<DepositIntent>(
      "SELECT * FROM deposit_intents WHERE id = $1",
      [intentId],
    );
    return rows[0] || null;
  },

  async markDepositIntentConfirmed(
    intentId: string,
    txSignature: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE deposit_intents
       SET status = 'confirmed',
           tx_signature = $2,
           confirmed_at = NOW()
       WHERE id = $1`,
      [intentId, txSignature],
    );
  },

  async markDepositIntentStatus(intentId: string, status: "expired" | "failed"): Promise<void> {
    await pool.query("UPDATE deposit_intents SET status = $2 WHERE id = $1", [
      intentId,
      status,
    ]);
  },

  async createDustDepositTransaction(
    userId: string,
    usdcAmount: number,
    txSignature: string,
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO transactions (user_id, type, usdc_amount, tx_signature)
         VALUES ($1, 'dust_deposit', $2, $3)`,
        [userId, usdcAmount, txSignature],
      );
    } catch (error) {
      const pgError = error as { code?: string; message?: string };
      const shouldFallback =
        pgError.code === "42703" || pgError.message?.includes("usdc_amount");

      if (!shouldFallback) {
        throw error;
      }

      await pool.query(
        `INSERT INTO transactions (user_id, type, sol_amount, tx_signature)
         VALUES ($1, 'dust_deposit', $2, $3)`,
        [userId, usdcAmount, txSignature],
      );
    }
  },

  async createSelfCustodyTrade(input: {
    userId: string;
    grailUserId: string;
    usdcAmount: number;
    estimatedGoldAmount: number;
    maxUsdcAmount: number;
    serializedTx: string;
  }): Promise<SelfCustodyTrade> {
    const { rows } = await pool.query<SelfCustodyTrade>(
      `INSERT INTO self_custody_trades (
         user_id,
         grail_user_id,
         usdc_amount,
         estimated_gold_amount,
         max_usdc_amount,
         serialized_tx
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.userId,
        input.grailUserId,
        input.usdcAmount,
        input.estimatedGoldAmount,
        input.maxUsdcAmount,
        input.serializedTx,
      ],
    );
    return rows[0];
  },

  async getSelfCustodyTradeById(tradeId: string): Promise<SelfCustodyTrade | null> {
    const { rows } = await pool.query<SelfCustodyTrade>(
      "SELECT * FROM self_custody_trades WHERE id = $1",
      [tradeId],
    );
    return rows[0] || null;
  },

  async completeSelfCustodyTrade(input: {
    tradeId: string;
    signedSerializedTx: string;
    submittedTxSignature: string;
  }): Promise<void> {
    await pool.query(
      `UPDATE self_custody_trades
       SET signed_serialized_tx = $2,
           submitted_tx_signature = $3,
           status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [input.tradeId, input.signedSerializedTx, input.submittedTxSignature],
    );
  },

  async failSelfCustodyTrade(tradeId: string, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE self_custody_trades
       SET status = 'failed',
           error_message = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [tradeId, errorMessage],
    );
  },

  async getPendingDust(): Promise<DustQueue[]> {
    const { rows } = await pool.query<DustQueue>(
      "SELECT * FROM dust_queue WHERE status = 'pending' ORDER BY created_at ASC",
    );
    return rows;
  },

  async getUserPendingDust(userId: string): Promise<DustQueue[]> {
    const { rows } = await pool.query<DustQueue>(
      "SELECT * FROM dust_queue WHERE user_id = $1 AND status = 'pending'",
      [userId],
    );
    return rows;
  },

  async updateDustStatus(
    dustId: string,
    status: string,
    batchId?: string,
  ): Promise<void> {
    await pool.query(
      "UPDATE dust_queue SET status = $1, batch_id = $2 WHERE id = $3",
      [status, batchId, dustId],
    );
  },

  async getGoldBalance(userId: string): Promise<number> {
    const { rows } = await pool.query<GoldBalance>(
      "SELECT gold_amount FROM gold_balances WHERE user_id = $1",
      [userId],
    );
    return rows[0]?.gold_amount || 0;
  },

  async updateGoldBalance(userId: string, goldAmount: number): Promise<void> {
    await pool.query(
      `INSERT INTO gold_balances (user_id, gold_amount) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         gold_amount = gold_balances.gold_amount + $2, 
         updated_at = NOW()`,
      [userId, goldAmount],
    );
  },

  async createBatch(totalUsdc: number): Promise<string> {
    try {
      const { rows } = await pool.query(
        "INSERT INTO batches (total_usdc) VALUES ($1) RETURNING id",
        [totalUsdc],
      );
      return rows[0].id;
    } catch (error) {
      const pgError = error as { code?: string; message?: string };
      const shouldFallback =
        pgError.code === "23502" ||
        pgError.code === "42703" ||
        pgError.message?.includes("total_sol");

      if (!shouldFallback) {
        throw error;
      }

      const { rows } = await pool.query(
        "INSERT INTO batches (total_sol) VALUES ($1) RETURNING id",
        [totalUsdc],
      );
      return rows[0].id;
    }
  },

  async updateBatch(
    batchId: string,
    updates: {
      total_usdc?: number;
      total_gold?: number;
      grail_tx_signature?: string;
      status?: string;
    },
  ): Promise<void> {
    const entries = Object.entries(updates);
    const fields = entries.map(([key], idx) => `${key} = $${idx + 2}`).join(", ");
    const values = entries.map(([, value]) => value);

    try {
      await pool.query(`UPDATE batches SET ${fields} WHERE id = $1`, [
        batchId,
        ...values,
      ]);
    } catch (error) {
      const pgError = error as { code?: string; message?: string };
      const hasTotalUsdc = entries.some(([key]) => key === "total_usdc");
      const shouldFallback =
        hasTotalUsdc &&
        (pgError.code === "42703" || pgError.message?.includes("total_usdc"));

      if (!shouldFallback) {
        throw error;
      }

      const fallbackEntries = entries.map(([key, value]) => [
        key === "total_usdc" ? "total_sol" : key,
        value,
      ]);
      const fallbackFields = fallbackEntries
        .map(([key], idx) => `${key} = $${idx + 2}`)
        .join(", ");
      const fallbackValues = fallbackEntries.map(([, value]) => value);

      await pool.query(`UPDATE batches SET ${fallbackFields} WHERE id = $1`, [
        batchId,
        ...fallbackValues,
      ]);
    }
  },

  async updateGrailUser(
    userId: string,
    grailUserId: string,
    grailUserPda: string,
  ): Promise<void> {
    await pool.query(
      `UPDATE users 
       SET grail_user_id = $1, 
           grail_user_pda = $2, 
           grail_registered_at = NOW() 
       WHERE id = $3`,
      [grailUserId, grailUserPda, userId],
    );
  },

  async isGrailRegistered(userId: string): Promise<boolean> {
    const { rows } = await pool.query(
      "SELECT grail_user_id FROM users WHERE id = $1",
      [userId],
    );
    return !!rows[0]?.grail_user_id;
  },

  async getUserByGrailId(grailUserId: string): Promise<User | null> {
    const { rows } = await pool.query<User>(
      "SELECT * FROM users WHERE grail_user_id = $1",
      [grailUserId],
    );
    return rows[0] || null;
  },
};
