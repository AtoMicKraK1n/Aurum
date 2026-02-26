"use client";

import { AuthProvider } from "@/lib/state/auth-context";
import { SolanaProvider } from "@/lib/solana/solana-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <AuthProvider>{children}</AuthProvider>
    </SolanaProvider>
  );
}
