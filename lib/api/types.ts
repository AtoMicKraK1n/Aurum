export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AurumUser = {
  id: string;
  wallet_address: string;
  grail_user_id?: string;
  grail_user_pda?: string;
  grail_registered_at?: string;
  created_at: string;
  updated_at: string;
};

export type DustQueue = {
  id: string;
  user_id: string;
  usdc_amount: string;
  status: "pending" | "processing" | "completed" | "failed";
  batch_id: string | null;
  created_at: string;
};

export type ConnectWalletData = {
  user: AurumUser;
  isNewUser: boolean;
};

export type AuthNonceData = {
  nonce: string;
  message: string;
  expiresAt: string;
};

export type CreateDepositIntentData = {
  intentId: string;
  recipientWallet: string;
  usdcMint: string;
  expectedUsdcAmount: number;
  expiresAt: string;
};

export type ConfirmDepositData = {
  queue: DustQueue;
  txSignature: string;
  receivedUsdcAmount: number;
};

export type DustStatusData = {
  pendingAmount: number | string;
  queueCount: number;
  status: string;
};

export type UserBalanceData = {
  balances: {
    sol: number;
    gold: number | string;
    onChainGrailGold: number;
  };
};

export type UserProfileData = {
  exists: boolean;
  grailLinked: boolean;
  user?: AurumUser;
};

export type RegisterUserInGrailData = {
  status: "existing" | "created";
  userId: string;
  grailUserId: string;
};

export type RunBatchData = {
  batchId: string;
  totalUsdc: number;
  totalGold: number;
  usersProcessed: number;
};

export type BuyQuoteData = {
  usdcAmount: number;
  goldAmount: number;
  goldPricePerOunce: number;
  source: "grail_live" | "fallback_cache";
  stale: boolean;
  timestamp: string;
};

export type SellQuoteData = {
  goldAmount: number;
  usdcAmount: number;
  goldPricePerOunce: number;
  source: "grail_live" | "fallback_cache";
  stale: boolean;
  timestamp: string;
};

export type PurchaseConfigData = {
  operatingMode: "custodial" | "self_custody";
  selfCustodyEnabled: boolean;
};

export type SelfPurchaseIntentData = {
  trade: {
    id: string;
    status: "pending" | "completed" | "failed";
  };
  serializedTx: string;
  signingInstructions?: unknown;
  status?: string;
};
