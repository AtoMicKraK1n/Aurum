"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuthState } from "@/lib/state/auth-context";
import { Briefcase, PenSquare, Wallet } from "lucide-react";

export default function HowItWorksPage() {
  const router = useRouter();
  const { walletAddress, setWalletAddress, reset } = useAuthState();
  const { logout, ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const activePrivyWallet = wallets.find(
    (wallet) => wallet.walletClientType === "solana",
  );
  const activeWallet = activePrivyWallet?.address ?? "";
  const canAccessScreen = Boolean(authenticated || activeWallet);

  useEffect(() => {
    if (activeWallet) {
      setWalletAddress(activeWallet);
    }
  }, [activeWallet, setWalletAddress]);

  useEffect(() => {
    if (!ready || !walletsReady) {
      return;
    }
    if (!canAccessScreen) {
      router.replace("/");
    }
  }, [canAccessScreen, ready, router, walletsReady]);

  async function handleDisconnect() {
    await logout();
    reset();
    router.replace("/");
  }

  async function handleBrandHome() {
    await logout();
    reset();
    router.replace("/");
  }

  return (
    <main className="how-shell">
      <section className="how-frame">
        <div className="how-card">
          <header className="how-topbar">
            <button
              type="button"
              className="how-brand how-brand-button"
              onClick={() => {
                void handleBrandHome();
              }}
            >
              AURUM
            </button>
            <p className="how-wallet-status">
              {canAccessScreen ? "WALLET CONNECTED" : "WALLET DISCONNECTED"}
            </p>
          </header>

          <div className="how-divider" />

          <div className="how-body">
            <h2 className="how-title">How it works</h2>
            <p className="how-subtitle">Turn dust into gold purchase flow</p>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <Wallet size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">CONNECT WALLET</h3>
                <p className="how-step-subtitle">
                  Link your Solana wallet to Aurum
                </p>
              </div>
            </article>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <PenSquare size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">SIGN PURCHASE</h3>
                <p className="how-step-subtitle">
                  Review availbe dust and approve each transaction in-wallet
                </p>
              </div>
            </article>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <Briefcase size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">RECEIVE TOKENIZED GOLD</h3>
                <p className="how-step-subtitle">
                  Gold settles directly to your wallet
                </p>
              </div>
            </article>
          </div>

          <div className="how-actions">
            <button
              type="button"
              className="how-button"
              onClick={() => router.push("/dashboard")}
            >
              ENTER AURUM →
            </button>

            {walletAddress || activeWallet ? (
              <p className="how-wallet">
                {(walletAddress || activeWallet).slice(0, 4)}...
                {(walletAddress || activeWallet).slice(-4)}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleDisconnect}
              className="how-disconnect"
            >
              DISCONNECT
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
