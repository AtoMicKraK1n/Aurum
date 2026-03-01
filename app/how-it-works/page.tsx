"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAuthState } from "@/lib/state/auth-context";
import { Briefcase, DollarSign, Loader } from "lucide-react";

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

  return (
    <main className="how-shell">
      <section className="how-frame">
        <div className="how-card">
          <header className="how-topbar">
            <h1 className="how-brand">AURUM</h1>
            <p className="how-wallet-status">
              {canAccessScreen ? "WALLET CONNECTED" : "WALLET DISCONNECTED"}
            </p>
          </header>

          <div className="how-divider" />

          <div className="how-body">
            <h2 className="how-title">How it works</h2>
            <p className="how-subtitle">Automated gold accumulation protocol</p>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <DollarSign size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">DEPOSIT DUST</h3>
                <p className="how-step-subtitle">Convert idle small balances</p>
              </div>
            </article>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <Loader size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">DAILY BATCH</h3>
                <p className="how-step-subtitle">
                  Pooled zero-slippage execution
                </p>
              </div>
            </article>

            <article className="how-step">
              <div className="how-step-icon" aria-hidden="true">
                <Briefcase size={15} strokeWidth={1.75} />
              </div>
              <div className="how-step-copy">
                <h3 className="how-step-title">RECEIVE GOLD</h3>
                <p className="how-step-subtitle">100% backed tokenized gold</p>
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
