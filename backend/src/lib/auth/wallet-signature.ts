import { randomBytes } from "crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

const AUTH_MESSAGE_PREFIX = "Aurum Wallet Authorization";

export function createAuthNonce(): string {
  return randomBytes(24).toString("hex");
}

export function getAuthMessage(walletAddress: string, nonce: string): string {
  return `${AUTH_MESSAGE_PREFIX}
Wallet: ${walletAddress}
Nonce: ${nonce}
Purpose: Authorize this wallet for Aurum access`;
}

export function verifyWalletSignature(input: {
  walletAddress: string;
  nonce: string;
  signatureBase58: string;
}): boolean {
  const { walletAddress, nonce, signatureBase58 } = input;
  const message = getAuthMessage(walletAddress, nonce);
  const messageBytes = new TextEncoder().encode(message);

  let signatureBytes: Uint8Array;
  let publicKeyBytes: Uint8Array;

  try {
    signatureBytes = bs58.decode(signatureBase58);
    publicKeyBytes = new PublicKey(walletAddress).toBytes();
  } catch {
    return false;
  }

  if (signatureBytes.length !== nacl.sign.signatureLength) {
    return false;
  }

  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}
