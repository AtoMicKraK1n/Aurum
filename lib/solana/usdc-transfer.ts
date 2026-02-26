import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTokenTransferInstruction,
  deriveAssociatedTokenAddress,
} from "./usdc-transfer-instruction";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export async function sendUsdcTransfer(params: {
  connection: Connection;
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
  fromWallet: PublicKey;
  toWallet: PublicKey;
  mint: PublicKey;
  amountUi: number;
  decimals?: number;
}): Promise<string> {
  const decimals = params.decimals ?? 6;
  const amountBaseUnits = BigInt(Math.round(params.amountUi * 10 ** decimals));

  const sourceAta = deriveAssociatedTokenAddress(
    params.fromWallet,
    params.mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const destinationAta = deriveAssociatedTokenAddress(
    params.toWallet,
    params.mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const transferIx = createTokenTransferInstruction(
    sourceAta,
    destinationAta,
    params.fromWallet,
    amountBaseUnits,
    TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction().add(transferIx);
  tx.feePayer = params.fromWallet;

  const signature = await params.sendTransaction(tx, params.connection);
  await params.connection.confirmTransaction(signature, "confirmed");
  return signature;
}
