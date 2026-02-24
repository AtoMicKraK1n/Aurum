import { strict as assert } from "node:assert";
import { runBatchConversionWithDeps } from "../lib/batch/converter";

type Dust = {
  id: string;
  user_id: string;
  usdc_amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  batch_id?: string;
};

function createDeps(
  initialDust: Dust[],
  purchaseGold: (usdcAmount: number) => Promise<{ goldAmount: number; txSignature: string }>,
) {
  const dust = initialDust.map((d) => ({ ...d }));
  const balances = new Map<string, number>();
  const batches = new Map<
    string,
    {
      total_usdc: number;
      total_gold?: number;
      grail_tx_signature?: string;
      status: string;
    }
  >();
  let batchCounter = 0;

  return {
    deps: {
      getPendingDust: async () => dust.filter((d) => d.status === "pending"),
      createBatch: async (totalUsdc: number) => {
        batchCounter += 1;
        const id = `batch-${batchCounter}`;
        batches.set(id, { total_usdc: totalUsdc, status: "processing" });
        return id;
      },
      updateDustStatus: async (dustId: string, status: string, batchId?: string) => {
        const row = dust.find((d) => d.id === dustId);
        if (!row) {
          throw new Error(`Missing dust row ${dustId}`);
        }
        row.status = status as Dust["status"];
        row.batch_id = batchId;
      },
      updateBatch: async (
        batchId: string,
        updates: {
          total_usdc?: number;
          total_gold?: number;
          grail_tx_signature?: string;
          status?: string;
        },
      ) => {
        const current = batches.get(batchId);
        if (!current) {
          throw new Error(`Missing batch ${batchId}`);
        }
        batches.set(batchId, { ...current, ...updates });
      },
      updateGoldBalance: async (userId: string, goldAmount: number) => {
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

  const result = await runBatchConversionWithDeps(deps);
  assert.equal(result.usersProcessed, 0);
  assert.equal(result.totalUsdc, 0);
  assert.equal(result.totalGold, 0);
  assert.equal(result.batchId, "");
}

async function testHappyPath() {
  const { deps, state } = createDeps(
    [
      { id: "d1", user_id: "u1", usdc_amount: 10, status: "pending" },
      { id: "d2", user_id: "u2", usdc_amount: 30, status: "pending" },
    ],
    async (usdcAmount: number) => {
      assert.equal(usdcAmount, 40);
      return { goldAmount: 2, txSignature: "tx-happy" };
    },
  );

  const result = await runBatchConversionWithDeps(deps);
  assert.equal(result.usersProcessed, 2);
  assert.equal(result.totalUsdc, 40);
  assert.equal(result.totalGold, 2);
  assert.equal(state.balances.get("u1"), 0.5);
  assert.equal(state.balances.get("u2"), 1.5);

  for (const row of state.dust) {
    assert.equal(row.status, "completed");
    assert.ok(row.batch_id);
  }
}

async function testFailurePath() {
  const { deps, state } = createDeps(
    [{ id: "d1", user_id: "u1", usdc_amount: 12, status: "pending" }],
    async () => {
      throw new Error("forced failure");
    },
  );

  await assert.rejects(() => runBatchConversionWithDeps(deps), /forced failure/);

  for (const row of state.dust) {
    assert.equal(row.status, "failed");
  }

  const onlyBatch = [...state.batches.values()][0];
  assert.equal(onlyBatch.status, "failed");
  assert.equal(state.balances.size, 0);
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
