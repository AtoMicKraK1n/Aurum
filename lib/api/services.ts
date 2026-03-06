import { ApiClient, createApiClient } from "./client";
import {
  AuthNonceData,
  BuyQuoteData,
  ConfirmDepositData,
  ConnectWalletData,
  CreateDepositIntentData,
  DustStatusData,
  PurchaseConfigData,
  RegisterUserInGrailData,
  RunBatchData,
  SellQuoteData,
  DustSweepSettingsData,
  SelfPurchaseIntentData,
  SelfPurchaseSubmitData,
  UserBalanceData,
  UserProfileData,
} from "./types";

export class AurumApiService {
  constructor(private readonly client: ApiClient) {}

  getAuthNonce(walletAddress: string): Promise<AuthNonceData> {
    return this.client.post<AuthNonceData>("/api/auth/nonce", {
      walletAddress,
    });
  }

  connectWallet(
    walletAddress: string,
    nonce: string,
    signature: string,
  ): Promise<ConnectWalletData> {
    return this.client.post<ConnectWalletData>("/api/auth/connect", {
      walletAddress,
      nonce,
      signature,
    });
  }

  createDepositIntent(
    walletAddress: string,
    usdcAmount: number,
  ): Promise<CreateDepositIntentData> {
    return this.client.post<CreateDepositIntentData>("/api/deposits/create-intent", {
      walletAddress,
      usdcAmount,
    });
  }

  confirmDeposit(intentId: string, txSignature: string): Promise<ConfirmDepositData> {
    return this.client.post<ConfirmDepositData>("/api/deposits/confirm", {
      intentId,
      txSignature,
    });
  }

  getDustStatus(walletAddress: string): Promise<DustStatusData> {
    const query = encodeURIComponent(walletAddress);
    return this.client.get<DustStatusData>(`/api/dust/status?walletAddress=${query}`);
  }

  getUserBalance(walletAddress: string): Promise<UserBalanceData> {
    const query = encodeURIComponent(walletAddress);
    return this.client.get<UserBalanceData>(`/api/user/balance?walletAddress=${query}`);
  }

  getUserProfile(walletAddress: string): Promise<UserProfileData> {
    const query = encodeURIComponent(walletAddress);
    return this.client.get<UserProfileData>(`/api/user/profile?walletAddress=${query}`);
  }

  registerUserInGrail(walletAddress: string): Promise<RegisterUserInGrailData> {
    return this.client.post<RegisterUserInGrailData>("/api/user/register-grail", {
      walletAddress,
    });
  }

  runBatch(adminKey: string): Promise<RunBatchData> {
    return this.client.post<RunBatchData>("/api/admin/batch/run", undefined, {
      "x-admin-key": adminKey,
    });
  }

  getBuyQuote(usdcAmount: number): Promise<BuyQuoteData> {
    return this.client.get<BuyQuoteData>(`/api/quotes/buy?usdcAmount=${usdcAmount}`);
  }

  getSellQuote(goldAmount: number): Promise<SellQuoteData> {
    return this.client.get<SellQuoteData>(`/api/quotes/sell?goldAmount=${goldAmount}`);
  }

  getPurchaseConfig(): Promise<PurchaseConfigData> {
    return this.client.get<PurchaseConfigData>("/api/purchase/config");
  }

  createSelfPurchaseIntent(
    walletAddress: string,
    usdcAmount: number,
    slippagePercent: number = 20,
    options?: {
      coSign?: boolean;
      userAsFeePayer?: boolean;
    },
  ): Promise<SelfPurchaseIntentData> {
    const coSign = options?.coSign ?? false;
    const userAsFeePayer = options?.userAsFeePayer ?? true;

    return this.client.post<SelfPurchaseIntentData>("/api/self/purchase-intent", {
      walletAddress,
      usdcAmount,
      slippagePercent,
      co_sign: coSign,
      userAsFeePayer,
    });
  }

  submitSelfPurchase(
    tradeId: string,
    signedSerializedTx: string,
  ): Promise<SelfPurchaseSubmitData> {
    return this.client.post<SelfPurchaseSubmitData>("/api/self/purchase-submit", {
      tradeId,
      signedSerializedTx,
    });
  }

  getDustSweepSettings(walletAddress: string): Promise<DustSweepSettingsData> {
    const query = encodeURIComponent(walletAddress);
    return this.client.get<DustSweepSettingsData>(
      `/api/dust/sweep/settings?walletAddress=${query}`,
    );
  }

  upsertDustSweepSettings(input: {
    walletAddress: string;
    enabled: boolean;
    minSweepUsdc: number;
    maxSweepUsdc: number;
    slippagePercent: number;
    cooldownMinutes: number;
  }): Promise<DustSweepSettingsData> {
    return this.client.post<DustSweepSettingsData>("/api/dust/sweep/settings", input);
  }
}

export function createAurumApiService(baseUrl?: string): AurumApiService {
  return new AurumApiService(createApiClient(baseUrl));
}
