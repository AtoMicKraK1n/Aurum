"use client";

import { AuthProvider } from "@/lib/state/auth-context";
import { PrivyAppProvider } from "@/lib/privy/privy-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAppProvider>
      <AuthProvider>{children}</AuthProvider>
    </PrivyAppProvider>
  );
}
