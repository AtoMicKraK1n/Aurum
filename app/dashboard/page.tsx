"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import { useAuthState } from "@/lib/state/auth-context";

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

type DashboardData = {
  totalGoldOz: number;
  totalGoldUsd: number;
  walletDustUsd: number;
  batchPendingCount: number;
  goldPricePerOz: number;
  progressPercent: number;
};

function parseNumber(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected request failure";
}

function formatNextBatch(secondsLeft: number): string {
  const hours = Math.floor(secondsLeft / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((secondsLeft % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function secondsUntilNextUtcMidnight(nowMs: number): number {
  const now = new Date(nowMs);
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  const diffMs = Math.max(0, next.getTime() - now.getTime());
  return Math.floor(diffMs / 1000);
}

async function getWalletUsdcBalance(walletAddress: string): Promise<number> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_DEVNET_RPC_URL;
  const usdcMint =
    process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;

  const connection = new Connection(rpcUrl);
  const ownerPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(usdcMint);

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    ownerPubkey,
    { mint: mintPubkey },
  );

  let balance = 0;

  for (const tokenAccount of tokenAccounts.value) {
    const parsedInfo = tokenAccount.account.data.parsed?.info;
    const amount = Number(parsedInfo?.tokenAmount?.uiAmount || 0);
    if (Number.isFinite(amount)) {
      balance += amount;
    }
  }

  return balance;
}

export default function DashboardPage() {
  const router = useRouter();
  const api = useMemo(() => createAurumApiService(), []);
  const { walletAddress, setWalletAddress } = useAuthState();
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextBatchSeconds, setNextBatchSeconds] = useState(() =>
    secondsUntilNextUtcMidnight(Date.now()),
  );
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalGoldOz: 0,
    totalGoldUsd: 0,
    walletDustUsd: 0,
    batchPendingCount: 0,
    goldPricePerOz: 0,
    progressPercent: 0,
  });
  const [convertInput, setConvertInput] = useState("");

  const activePrivyWallet = wallets.find(
    (wallet) => wallet.walletClientType === "solana",
  );
  const activeWallet = activePrivyWallet?.address ?? "";
  const canAccessScreen = Boolean(
    authenticated || activeWallet || walletAddress,
  );
  const resolvedWalletAddress = walletAddress || activeWallet;

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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNextBatchSeconds(secondsUntilNextUtcMidnight(Date.now()));
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!ready || !walletsReady || !resolvedWalletAddress || !canAccessScreen) {
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [balanceData, dustData, quoteData] = await Promise.all([
          api.getUserBalance(resolvedWalletAddress),
          api.getDustStatus(resolvedWalletAddress),
          api.getSellQuote(1),
        ]);

        if (cancelled) {
          return;
        }

        const goldOz = parseNumber(balanceData.balances.gold);
        const goldPricePerOz = parseNumber(quoteData.goldPricePerOunce);
        const totalGoldUsd = goldOz * goldPricePerOz;
        const pendingDust = parseNumber(dustData.pendingAmount);
        const walletUsdcBalance = await getWalletUsdcBalance(resolvedWalletAddress);
        const pendingCount = Math.max(0, dustData.queueCount || 0);
        const progressPercent =
          pendingCount === 0
            ? 0
            : Math.min(95, Math.max(15, pendingCount * 15));

        setDashboardData({
          totalGoldOz: goldOz,
          totalGoldUsd,
          walletDustUsd: walletUsdcBalance,
          batchPendingCount: pendingCount,
          goldPricePerOz,
          progressPercent,
        });

        setConvertInput((prev) => {
          if (prev.trim().length > 0) {
            return prev;
          }
          return walletUsdcBalance > 0
            ? walletUsdcBalance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : pendingDust > 0
              ? pendingDust.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "";
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(formatError(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [api, canAccessScreen, ready, resolvedWalletAddress, walletsReady]);

  return (
    <main className="dashboard-shell">
      <section className="dashboard-frame">
        <div className="dashboard-card">
          <header className="dashboard-topbar">
            <h1 className="dashboard-brand">AURUM</h1>
            <p className="dashboard-wallet-status">
              {canAccessScreen ? "WALLET CONNECTED" : "WALLET DISCONNECTED"}
            </p>
          </header>

          <div className="dashboard-divider" />

          <section className="dashboard-hero">
            <p className="dashboard-kicker">TOTAL TOKENIZED GOLD</p>
            <p className="dashboard-amount">
              {dashboardData.totalGoldOz.toFixed(3)}
              <span className="dashboard-unit">OZ</span>
            </p>
            <p className="dashboard-value">
              ≈ $
              {dashboardData.totalGoldUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              USD
            </p>
          </section>

          <div className="dashboard-divider" />

          <section className="dashboard-stats" aria-label="tokenization stats">
            <article className="dashboard-stat">
              <p className="dashboard-stat-label">WALLET DUST</p>
              <p className="dashboard-stat-value">
                {dashboardData.walletDustUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                $
              </p>
            </article>
            <article className="dashboard-stat dashboard-stat-right">
              <p className="dashboard-stat-label">BATCH PENDING</p>
              <p className="dashboard-stat-value">
                {dashboardData.batchPendingCount}
              </p>
            </article>
            <article className="dashboard-stat dashboard-stat-bottom">
              <p className="dashboard-stat-label">GOLD PRICE</p>
              <p className="dashboard-stat-value">
                $
                {dashboardData.goldPricePerOz.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
              </p>
            </article>
            <article className="dashboard-stat dashboard-stat-right dashboard-stat-bottom">
              <p className="dashboard-stat-label">NEXT BATCH</p>
              <p className="dashboard-stat-value">
                {formatNextBatch(nextBatchSeconds)}
              </p>
            </article>
          </section>

          <div className="dashboard-divider" />

          <section className="dashboard-progress">
            <div className="dashboard-progress-row">
              <p className="dashboard-progress-label">
                {dashboardData.batchPendingCount > 0
                  ? "BATCH PROCESSING"
                  : "NO ACTIVE BATCH"}
              </p>
              <p className="dashboard-progress-percent">
                {dashboardData.progressPercent}%
              </p>
            </div>
            <div className="dashboard-progress-track" aria-hidden="true">
              <div
                className="dashboard-progress-fill"
                style={{ width: `${dashboardData.progressPercent}%` }}
              />
            </div>
          </section>

          <div className="dashboard-divider" />

          <section className="dashboard-convert">
            <p className="dashboard-convert-label">AMOUNT TO CONVERT</p>
            <div className="dashboard-convert-row">
              <input
                type="text"
                inputMode="decimal"
                className="dashboard-convert-input"
                placeholder="0.00"
                value={convertInput}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9.]/g, "");
                  const dotCount = (next.match(/\./g) || []).length;
                  if (dotCount > 1) {
                    return;
                  }
                  setConvertInput(next);
                }}
              />
              <p className="dashboard-convert-unit">USDC</p>
            </div>
          </section>

          <div className="dashboard-actions">
            <button
              type="button"
              className="dashboard-button"
              disabled={loading}
            >
              <span>CONFIRM DEPOSIT</span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="dashboard-footer">
              {error
                ? `ERROR: ${error}`
                : loading
                  ? "LOADING LIVE DATA"
                  : "POWERED BY GRAIL"}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
