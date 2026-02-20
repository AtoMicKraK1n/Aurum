import { Connection, Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { db } from "../../db/queries";
import { swapSolToUsdc } from "../jupiter/swap";
import { purchaseGold } from "../grail/purchase";

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const sponsorKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.SPONSOR_PRIVATE_KEY!),
);

export async function runBatchConversion(): Promise<{
  batchId: string;
  totalSol: number;
  totalGold: number;
  usersProcessed: number;
}> {
  console.log("Starting batch conversion...");

  const pendingDust = await db.getPendingDust();

  if (pendingDust.length === 0) {
    console.log("No pending dust to process");
    return { batchId: "", totalSol: 0, totalGold: 0, usersProcessed: 0 };
  }

  const totalSol = pendingDust.reduce((sum, d) => sum + d.sol_amount, 0);
  const totalLamports = pendingDust.reduce(
    (sum, d) => sum + BigInt(d.sol_lamports),
    BigInt(0),
  );

  console.log(`Processing ${pendingDust.length} users, ${totalSol} SOL`);
  const batchId = await db.createBatch(totalSol);

  for (const dust of pendingDust) {
    await db.updateDustStatus(dust.id, "processing", batchId);
  }

  try {
    console.log("Converting SOL → USDC...");
    const { usdcAmount } = await swapSolToUsdc(totalLamports);
    const jupiterSig = "mock-swap-signature";

    console.log(`Converted to ${usdcAmount} USDC (mocked)`);

    console.log("Buying GOLD via GRAIL...");
    const { goldAmount, transaction: grailTx } = await purchaseGold(usdcAmount);

    const grailTransaction = Transaction.from(Buffer.from(grailTx, "base64"));
    grailTransaction.sign(sponsorKeypair);
    const grailSig = await connection.sendRawTransaction(
      grailTransaction.serialize(),
    );
    await connection.confirmTransaction(grailSig);

    console.log(`Purchased ${goldAmount} oz GOLD (tx: ${grailSig})`);

    await db.updateBatch(batchId, {
      total_usdc: usdcAmount,
      total_gold: goldAmount,
      jupiter_tx_signature: jupiterSig,
      grail_tx_signature: grailSig,
      status: "completed",
    });

    console.log("Distributing gold to users...");
    for (const dust of pendingDust) {
      const userShare = (dust.sol_amount / totalSol) * goldAmount;
      await db.updateGoldBalance(dust.user_id, userShare);
      await db.updateDustStatus(dust.id, "completed", batchId);
    }

    console.log(`Batch ${batchId} completed!`);

    return {
      batchId,
      totalSol,
      totalGold: goldAmount,
      usersProcessed: pendingDust.length,
    };
  } catch (error) {
    console.error("Batch failed:", error);
    await db.updateBatch(batchId, { status: "failed" });

    for (const dust of pendingDust) {
      await db.updateDustStatus(dust.id, "failed", batchId);
    }

    throw error;
  }
}
