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
  sol_amount: number;
  sol_lamports: bigint;
  status: "pending" | "processing" | "completed" | "failed";
  batch_id?: string;
  created_at: Date;
}

export interface Batch {
  id: string;
  total_sol: number;
  total_usdc?: number;
  total_gold?: number;
  jupiter_tx_signature?: string;
  grail_tx_signature?: string;
  status: "processing" | "completed" | "failed";
  executed_at: Date;
}

export interface GoldBalance {
  user_id: string;
  gold_amount: number;
  updated_at: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
