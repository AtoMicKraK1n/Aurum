import { pool } from "./client";
import { User, DustQueue, GoldBalance } from "../types";

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
    solAmount: number,
    solLamports: bigint,
  ): Promise<DustQueue> {
    const { rows } = await pool.query<DustQueue>(
      "INSERT INTO dust_queue (user_id, sol_amount, sol_lamports) VALUES ($1, $2, $3) RETURNING *",
      [userId, solAmount, solLamports.toString()],
    );
    return rows[0];
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

  async createBatch(totalSol: number): Promise<string> {
    const { rows } = await pool.query(
      "INSERT INTO batches (total_sol) VALUES ($1) RETURNING id",
      [totalSol],
    );
    return rows[0].id;
  },

  async updateBatch(
    batchId: string,
    updates: {
      total_usdc?: number;
      total_gold?: number;
      jupiter_tx_signature?: string;
      grail_tx_signature?: string;
      status?: string;
    },
  ): Promise<void> {
    const fields = Object.keys(updates)
      .map((key, idx) => `${key} = $${idx + 2}`)
      .join(", ");

    await pool.query(`UPDATE batches SET ${fields} WHERE id = $1`, [
      batchId,
      ...Object.values(updates),
    ]);
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
