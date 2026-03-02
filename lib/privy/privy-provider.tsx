"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

export function PrivyAppProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is required to initialize Privy.",
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#a49674",
          logo: undefined,
          showWalletLoginFirst: true,
          walletChainType: "solana-only",
          walletList: [
            "phantom",
            "solflare",
            "backpack",
            "detected_solana_wallets",
          ],
        },
        embeddedWallets: {
          solana: {
            createOnLogin: "off",
          },
        },

        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors(),
          },
        },
        loginMethods: ["wallet"],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
