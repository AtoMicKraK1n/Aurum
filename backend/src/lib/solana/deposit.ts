import { Connection } from "@solana/web3.js";

const DEFAULT_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const connection = new Connection(process.env.SOLANA_RPC_URL!);

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function verifyUsdcDeposit(params: {
  txSignature: string;
  expectedUsdcAmount: number;
  senderWallet: string;
}): Promise<{ receivedUsdcAmount: number }> {
  const treasuryWallet = getRequiredEnv("TREASURY_WALLET_ADDRESS");
  const usdcMint = process.env.USDC_MINT || DEFAULT_USDC_MINT;

  const tx = await connection.getParsedTransaction(params.txSignature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found on RPC");
  }

  if (tx.meta?.err) {
    throw new Error("Transaction failed on-chain");
  }

  const senderInAccounts = tx.transaction.message.accountKeys.some(
    (key) => key.pubkey.toBase58() === params.senderWallet,
  );

  if (!senderInAccounts) {
    throw new Error("Sender wallet not present in transaction");
  }

  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  let received = 0;

  for (const postBal of post) {
    if (postBal.mint !== usdcMint || postBal.owner !== treasuryWallet) {
      continue;
    }

    const preBal = pre.find((b) => b.accountIndex === postBal.accountIndex);
    const postUi = Number(postBal.uiTokenAmount.uiAmountString ?? "0");
    const preUi = Number(preBal?.uiTokenAmount.uiAmountString ?? "0");
    const delta = postUi - preUi;

    if (delta > 0) {
      received += delta;
    }
  }

  if (received + 1e-9 < params.expectedUsdcAmount) {
    throw new Error(
      `Insufficient treasury USDC received. Expected ${params.expectedUsdcAmount}, got ${received}`,
    );
  }

  return { receivedUsdcAmount: received };
}
