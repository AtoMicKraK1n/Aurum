import { ApiClient, createApiClient } from "./client";
import {
  BuyQuoteData,
  ConfirmDepositData,
  ConnectWalletData,
  CreateDepositIntentData,
  DustStatusData,
  RunBatchData,
  SellQuoteData,
  UserBalanceData,
} from "./types";

export class AurumApiService {
  constructor(private readonly client: ApiClient) {}

  connectWallet(walletAddress: string): Promise<ConnectWalletData> {
    return this.client.post<ConnectWalletData>("/api/auth/connect", {
      walletAddress,
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
}

export function createAurumApiService(baseUrl?: string): AurumApiService {
  return new AurumApiService(createApiClient(baseUrl));
}
