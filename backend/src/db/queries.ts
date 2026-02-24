import { pool } from "./client";
import { User, DustQueue, GoldBalance, DepositIntent } from "../types";

export const db = {
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
