"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const converter_1 = require("../lib/batch/converter");
function createDeps(initialDust, purchaseGold) {
    const dust = initialDust.map((d) => ({ ...d }));
    const balances = new Map();
    const batches = new Map();
    let batchCounter = 0;
    return {
        deps: {
            getPendingDust: async () => dust.filter((d) => d.status === "pending"),
            createBatch: async (totalUsdc) => {
                batchCounter += 1;
                const id = `batch-${batchCounter}`;
                batches.set(id, { total_usdc: totalUsdc, status: "processing" });
                return id;
            },
            updateDustStatus: async (dustId, status, batchId) => {
                const row = dust.find((d) => d.id === dustId);
                if (!row) {
                    throw new Error(`Missing dust row ${dustId}`);
                }
                row.status = status;
                row.batch_id = batchId;
            },
            updateBatch: async (batchId, updates) => {
                const current = batches.get(batchId);
                if (!current) {
                    throw new Error(`Missing batch ${batchId}`);
                }
                batches.set(batchId, { ...current, ...updates });
            },
            updateGoldBalance: async (userId, goldAmount) => {
                balances.set(userId, (balances.get(userId) ?? 0) + goldAmount);
            },
            purchaseGold,
        },
        state: {
            dust,
            balances,
            batches,
        },
    };
}
async function testEmptyBatch() {
    const { deps } = createDeps([], async () => {
        throw new Error("purchaseGold should not be called");
    });
    const result = await (0, converter_1.runBatchConversionWithDeps)(deps);
    node_assert_1.strict.equal(result.usersProcessed, 0);
    node_assert_1.strict.equal(result.totalUsdc, 0);
    node_assert_1.strict.equal(result.totalGold, 0);
    node_assert_1.strict.equal(result.batchId, "");
}
async function testHappyPath() {
    const { deps, state } = createDeps([
        { id: "d1", user_id: "u1", usdc_amount: 10, status: "pending" },
        { id: "d2", user_id: "u2", usdc_amount: 30, status: "pending" },
    ], async (usdcAmount) => {
        node_assert_1.strict.equal(usdcAmount, 40);
        return { goldAmount: 2, txSignature: "tx-happy" };
    });
    const result = await (0, converter_1.runBatchConversionWithDeps)(deps);
    node_assert_1.strict.equal(result.usersProcessed, 2);
    node_assert_1.strict.equal(result.totalUsdc, 40);
    node_assert_1.strict.equal(result.totalGold, 2);
    node_assert_1.strict.equal(state.balances.get("u1"), 0.5);
    node_assert_1.strict.equal(state.balances.get("u2"), 1.5);
    for (const row of state.dust) {
        node_assert_1.strict.equal(row.status, "completed");
        node_assert_1.strict.ok(row.batch_id);
    }
}
async function testFailurePath() {
    const { deps, state } = createDeps([{ id: "d1", user_id: "u1", usdc_amount: 12, status: "pending" }], async () => {
        throw new Error("forced failure");
    });
    await node_assert_1.strict.rejects(() => (0, converter_1.runBatchConversionWithDeps)(deps), /forced failure/);
    for (const row of state.dust) {
        node_assert_1.strict.equal(row.status, "failed");
    }
    const onlyBatch = [...state.batches.values()][0];
    node_assert_1.strict.equal(onlyBatch.status, "failed");
    node_assert_1.strict.equal(state.balances.size, 0);
}
async function main() {
    await testEmptyBatch();
    await testHappyPath();
    await testFailurePath();
    console.log("Batch converter tests passed");
}
main().catch((error) => {
    console.error("Batch converter tests failed:", error);
    process.exit(1);
});
