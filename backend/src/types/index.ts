export interface User {
  id: string;
  wallet_address: string;
  grail_user_id?: string;
  grail_user_pda?: string;
  grail_registered_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface DustQueue {
  id: string;
  user_id: string;
  usdc_amount: number;
  status: "pending" | "processing" | "completed" | "failed";
  batch_id?: string;
  created_at: Date;
}

export interface Batch {
  id: string;
  total_usdc: number;
  total_gold?: number;
  grail_tx_signature?: string;
  status: "processing" | "completed" | "failed";
  executed_at: Date;
}

export interface GoldBalance {
  user_id: string;
  gold_amount: number;
  updated_at: Date;
}

export interface DepositIntent {
  id: string;
  user_id: string;
  wallet_address: string;
  expected_usdc_amount: number;
  tx_signature?: string;
  status: "pending" | "confirmed" | "expired" | "failed";
  expires_at: Date;
  created_at: Date;
  confirmed_at?: Date;
}

export interface SelfCustodyTrade {
  id: string;
  user_id: string;
  grail_user_id: string;
  usdc_amount: number;
  estimated_gold_amount: number;
  max_usdc_amount: number;
  serialized_tx: string;
  signed_serialized_tx?: string;
  submitted_tx_signature?: string;
  status: "pending" | "completed" | "failed";
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
