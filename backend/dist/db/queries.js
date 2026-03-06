"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const client_1 = require("./client");
const BATCH_LOCK_KEY = 7249001;
exports.db = {
    async acquireBatchLock() {
        const { rows } = await client_1.pool.query("SELECT pg_try_advisory_lock($1) AS locked", [BATCH_LOCK_KEY]);
        return !!rows[0]?.locked;
    },
    async releaseBatchLock() {
        await client_1.pool.query("SELECT pg_advisory_unlock($1)", [BATCH_LOCK_KEY]);
    },
    async createUser(walletAddress) {
        const { rows } = await client_1.pool.query(`INSERT INTO users (wallet_address) 
       VALUES ($1) 
       ON CONFLICT (wallet_address) 
       DO UPDATE SET updated_at = NOW() 
       RETURNING *`, [walletAddress]);
        return rows[0];
    },
    async createWalletAuthNonce(walletAddress, nonce, expiresAt) {
        await client_1.pool.query("DELETE FROM wallet_auth_nonces WHERE wallet_address = $1 AND used_at IS NULL", [walletAddress]);
        const { rows } = await client_1.pool.query(`INSERT INTO wallet_auth_nonces (wallet_address, nonce, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`, [walletAddress, nonce, expiresAt.toISOString()]);
        return rows[0];
    },
    async getValidWalletAuthNonce(walletAddress, nonce) {
        const { rows } = await client_1.pool.query(`SELECT *
       FROM wallet_auth_nonces
       WHERE wallet_address = $1
         AND nonce = $2
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`, [walletAddress, nonce]);
        return rows[0] || null;
    },
    async markWalletAuthNonceUsed(id) {
        await client_1.pool.query("UPDATE wallet_auth_nonces SET used_at = NOW() WHERE id = $1", [id]);
    },
    async getUserByWallet(walletAddress) {
        const { rows } = await client_1.pool.query("SELECT * FROM users WHERE wallet_address = $1", [walletAddress]);
        return rows[0] || null;
    },
    async queueDust(userId, usdcAmount) {
        const { rows } = await client_1.pool.query("INSERT INTO dust_queue (user_id, usdc_amount) VALUES ($1, $2) RETURNING *", [userId, usdcAmount]);
        return rows[0];
    },
    async createDepositIntent(userId, walletAddress, expectedUsdcAmount, expiresAt) {
        const { rows } = await client_1.pool.query(`INSERT INTO deposit_intents (user_id, wallet_address, expected_usdc_amount, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`, [userId, walletAddress, expectedUsdcAmount, expiresAt.toISOString()]);
        return rows[0];
    },
    async getDepositIntentById(intentId) {
        const { rows } = await client_1.pool.query("SELECT * FROM deposit_intents WHERE id = $1", [intentId]);
        return rows[0] || null;
    },
    async markDepositIntentConfirmed(intentId, txSignature) {
        await client_1.pool.query(`UPDATE deposit_intents
       SET status = 'confirmed',
           tx_signature = $2,
           confirmed_at = NOW()
       WHERE id = $1`, [intentId, txSignature]);
    },
    async markDepositIntentStatus(intentId, status) {
        await client_1.pool.query("UPDATE deposit_intents SET status = $2 WHERE id = $1", [
            intentId,
            status,
        ]);
    },
    async createDustDepositTransaction(userId, usdcAmount, txSignature) {
        try {
            await client_1.pool.query(`INSERT INTO transactions (user_id, type, usdc_amount, tx_signature)
         VALUES ($1, 'dust_deposit', $2, $3)`, [userId, usdcAmount, txSignature]);
        }
        catch (error) {
            const pgError = error;
            const shouldFallback = pgError.code === "42703" || pgError.message?.includes("usdc_amount");
            if (!shouldFallback) {
                throw error;
            }
            await client_1.pool.query(`INSERT INTO transactions (user_id, type, sol_amount, tx_signature)
         VALUES ($1, 'dust_deposit', $2, $3)`, [userId, usdcAmount, txSignature]);
        }
    },
    async createSelfCustodyTrade(input) {
        const { rows } = await client_1.pool.query(`INSERT INTO self_custody_trades (
         user_id,
         grail_user_id,
         usdc_amount,
         estimated_gold_amount,
         max_usdc_amount,
         serialized_tx
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [
            input.userId,
            input.grailUserId,
            input.usdcAmount,
            input.estimatedGoldAmount,
            input.maxUsdcAmount,
            input.serializedTx,
        ]);
        return rows[0];
    },
    async getSelfCustodyTradeById(tradeId) {
        const { rows } = await client_1.pool.query("SELECT * FROM self_custody_trades WHERE id = $1", [tradeId]);
        return rows[0] || null;
    },
    async completeSelfCustodyTrade(input) {
        try {
            await client_1.pool.query(`UPDATE self_custody_trades
         SET signed_serialized_tx = $2,
             submitted_tx_signature = $3,
             status = 'completed',
             updated_at = NOW()
         WHERE id = $1`, [input.tradeId, input.signedSerializedTx, input.submittedTxSignature]);
        }
        catch (error) {
            const pgError = error;
            const missingColumn = pgError.code === "42703" ||
                pgError.message?.includes("signed_serialized_tx") ||
                pgError.message?.includes("submitted_tx_signature");
            if (!missingColumn) {
                throw error;
            }
            // Backward compatibility for environments with older schema.
            await client_1.pool.query(`UPDATE self_custody_trades
         SET status = 'completed',
             updated_at = NOW()
         WHERE id = $1`, [input.tradeId]);
        }
    },
    async failSelfCustodyTrade(tradeId, errorMessage) {
        await client_1.pool.query(`UPDATE self_custody_trades
       SET status = 'failed',
           error_message = $2,
           updated_at = NOW()
       WHERE id = $1`, [tradeId, errorMessage]);
    },
    async getPendingDust() {
        const { rows } = await client_1.pool.query("SELECT * FROM dust_queue WHERE status = 'pending' ORDER BY created_at ASC");
        return rows;
    },
    async getUserPendingDust(userId) {
        const { rows } = await client_1.pool.query("SELECT * FROM dust_queue WHERE user_id = $1 AND status = 'pending'", [userId]);
        return rows;
    },
    async updateDustStatus(dustId, status, batchId) {
        await client_1.pool.query("UPDATE dust_queue SET status = $1, batch_id = $2 WHERE id = $3", [status, batchId, dustId]);
    },
    async getGoldBalance(userId) {
        const { rows } = await client_1.pool.query("SELECT gold_amount FROM gold_balances WHERE user_id = $1", [userId]);
        return rows[0]?.gold_amount || 0;
    },
    async updateGoldBalance(userId, goldAmount) {
        await client_1.pool.query(`INSERT INTO gold_balances (user_id, gold_amount) 
       VALUES ($1, $2) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         gold_amount = gold_balances.gold_amount + $2, 
         updated_at = NOW()`, [userId, goldAmount]);
    },
    async createBatch(totalUsdc) {
        try {
            const { rows } = await client_1.pool.query("INSERT INTO batches (total_usdc) VALUES ($1) RETURNING id", [totalUsdc]);
            return rows[0].id;
        }
        catch (error) {
            const pgError = error;
            const shouldFallback = pgError.code === "23502" ||
                pgError.code === "42703" ||
                pgError.message?.includes("total_sol");
            if (!shouldFallback) {
                throw error;
            }
            const { rows } = await client_1.pool.query("INSERT INTO batches (total_sol) VALUES ($1) RETURNING id", [totalUsdc]);
            return rows[0].id;
        }
    },
    async updateBatch(batchId, updates) {
        const entries = Object.entries(updates);
        const fields = entries.map(([key], idx) => `${key} = $${idx + 2}`).join(", ");
        const values = entries.map(([, value]) => value);
        try {
            await client_1.pool.query(`UPDATE batches SET ${fields} WHERE id = $1`, [
                batchId,
                ...values,
            ]);
        }
        catch (error) {
            const pgError = error;
            const hasTotalUsdc = entries.some(([key]) => key === "total_usdc");
            const shouldFallback = hasTotalUsdc &&
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
            await client_1.pool.query(`UPDATE batches SET ${fallbackFields} WHERE id = $1`, [
                batchId,
                ...fallbackValues,
            ]);
        }
    },
    async updateGrailUser(userId, grailUserId, grailUserPda) {
        await client_1.pool.query(`UPDATE users 
       SET grail_user_id = $1, 
           grail_user_pda = $2, 
           grail_registered_at = NOW() 
       WHERE id = $3`, [grailUserId, grailUserPda, userId]);
    },
    async isGrailRegistered(userId) {
        const { rows } = await client_1.pool.query("SELECT grail_user_id FROM users WHERE id = $1", [userId]);
        return !!rows[0]?.grail_user_id;
    },
    async getUserByGrailId(grailUserId) {
        const { rows } = await client_1.pool.query("SELECT * FROM users WHERE grail_user_id = $1", [grailUserId]);
        return rows[0] || null;
    },
    async getDustSweepSettings(userId) {
        const { rows } = await client_1.pool.query("SELECT * FROM dust_sweep_settings WHERE user_id = $1", [userId]);
        return rows[0] || null;
    },
    async upsertDustSweepSettings(input) {
        const { rows } = await client_1.pool.query(`INSERT INTO dust_sweep_settings (
         user_id,
         enabled,
         min_sweep_usdc,
         max_sweep_usdc,
         slippage_percent,
         cooldown_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         min_sweep_usdc = EXCLUDED.min_sweep_usdc,
         max_sweep_usdc = EXCLUDED.max_sweep_usdc,
         slippage_percent = EXCLUDED.slippage_percent,
         cooldown_minutes = EXCLUDED.cooldown_minutes,
         updated_at = NOW()
       RETURNING *`, [
            input.userId,
            input.enabled,
            input.minSweepUsdc,
            input.maxSweepUsdc,
            input.slippagePercent,
            input.cooldownMinutes,
        ]);
        return rows[0];
    },
    async listDustSweepRuns(userId, limit) {
        const { rows } = await client_1.pool.query(`SELECT *
       FROM dust_sweep_runs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`, [userId, limit]);
        return rows;
    },
    async getLatestDustSweepRun(userId) {
        const { rows } = await client_1.pool.query(`SELECT *
       FROM dust_sweep_runs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`, [userId]);
        return rows[0] || null;
    },
    async getEnabledDustSweepUsers() {
        const { rows } = await client_1.pool.query(`SELECT
         s.user_id,
         u.wallet_address,
         u.grail_user_id,
         s.enabled,
         s.min_sweep_usdc,
         s.max_sweep_usdc,
         s.slippage_percent,
         s.cooldown_minutes
       FROM dust_sweep_settings s
       JOIN users u ON u.id = s.user_id
       WHERE s.enabled = TRUE`);
        return rows;
    },
    async hasPendingSelfCustodyTrade(userId) {
        const { rows } = await client_1.pool.query(`SELECT EXISTS (
         SELECT 1
         FROM self_custody_trades
         WHERE user_id = $1 AND status = 'pending'
       ) AS exists`, [userId]);
        return Boolean(rows[0]?.exists);
    },
    async createDustSweepRun(input) {
        const { rows } = await client_1.pool.query(`INSERT INTO dust_sweep_runs (
         user_id,
         status,
         trigger_amount_usdc,
         sweep_amount_usdc,
         trade_id,
         tx_signature,
         error_message,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`, [
            input.userId,
            input.status,
            input.triggerAmountUsdc,
            input.sweepAmountUsdc,
            input.tradeId || null,
            input.txSignature || null,
            input.errorMessage || null,
            JSON.stringify(input.metadata || {}),
        ]);
        return rows[0];
    },
    async updateDustSweepRun(runId, updates) {
        const fields = [];
        const values = [runId];
        if (updates.status !== undefined) {
            values.push(updates.status);
            fields.push(`status = $${values.length}`);
        }
        if (updates.tradeId !== undefined) {
            values.push(updates.tradeId);
            fields.push(`trade_id = $${values.length}`);
        }
        if (updates.txSignature !== undefined) {
            values.push(updates.txSignature);
            fields.push(`tx_signature = $${values.length}`);
        }
        if (updates.errorMessage !== undefined) {
            values.push(updates.errorMessage);
            fields.push(`error_message = $${values.length}`);
        }
        if (updates.metadata !== undefined) {
            values.push(JSON.stringify(updates.metadata));
            fields.push(`metadata = $${values.length}::jsonb`);
        }
        if (fields.length === 0) {
            return;
        }
        fields.push("updated_at = NOW()");
        await client_1.pool.query(`UPDATE dust_sweep_runs
       SET ${fields.join(", ")}
       WHERE id = $1`, values);
    },
};
