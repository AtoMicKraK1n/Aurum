"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Connection, PublicKey } from "@solana/web3.js";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import { useAuthState } from "@/lib/state/auth-context";

const DEFAULT_DEVNET_RPC_URL =
  "https://devnet.helius-rpc.com/?api-key=c434b5e0-f58e-4d87-84c1-b7bba03c939f";
const DEFAULT_DEVNET_USDC_MINT = "8METbBgV5CSyorAaW5Lm42dbWdE8JU9vfBiM67TK9Mp4";
const DEFAULT_DEVNET_GOLD_MINT = "Cu5rvMuh9asSHyCtof81B8sYU8iM62MgaWVVZnQDDZst";
const FALLBACK_NETWORK_FEE_USD = 0.02;

type DashboardData = {
  totalGoldOz: number;
  totalGoldUsd: number;
  walletDustUsd: number;
  goldPricePerOz: number;
};

type PurchaseMode = "custodial" | "self_custody";
type RegistrationGate = "checking" | "registered" | "unregistered";

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

function parseInputAmount(value: string): number {
  const numeric = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function shortenWalletAddress(address: string): string {
  if (address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

type BuyEstimateState = {
  usdcAmount: number;
  goldAmount: number;
  stale: boolean;
  source: "grail_live" | "fallback_cache";
  updatedAt: string;
};

function getPrivySolanaAddress(privyUser: unknown): string {
  if (!privyUser || typeof privyUser !== "object") {
    return "";
  }

  const candidate = privyUser as {
    wallet?: { address?: string };
    linkedAccounts?: Array<{
      type?: string;
      chainType?: string;
      address?: string;
    }>;
  };

  if (candidate.wallet?.address) {
    return candidate.wallet.address;
  }

  const linked = candidate.linkedAccounts || [];
  const solanaAccount = linked.find(
    (account) =>
      account.address &&
      (account.type === "wallet" || account.type === "cross_app") &&
      account.chainType === "solana",
  );

  return solanaAccount?.address || "";
}

async function getWalletTokenBalance(
  walletAddress: string,
  mintAddress: string,
): Promise<number> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_DEVNET_RPC_URL;

  const connection = new Connection(rpcUrl);
  const ownerPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(mintAddress);

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
  const { ready, authenticated, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalGoldOz: 0,
    totalGoldUsd: 0,
    walletDustUsd: 0,
    goldPricePerOz: 0,
  });
  const [convertInput, setConvertInput] = useState("");
  const [purchaseMode, setPurchaseMode] =
    useState<PurchaseMode>("self_custody");
  const [purchaseActionMessage, setPurchaseActionMessage] = useState<
    string | null
  >(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [registeringUser, setRegisteringUser] = useState(false);
  const [registrationGate, setRegistrationGate] =
    useState<RegistrationGate>("checking");
  const [buyEstimate, setBuyEstimate] = useState<BuyEstimateState>({
    usdcAmount: 0,
    goldAmount: 0,
    stale: false,
    source: "grail_live",
    updatedAt: "",
  });

  const activePrivyWallet = wallets.find(
    (wallet) => wallet.walletClientType === "solana",
  );
  const activeWallet = activePrivyWallet?.address ?? "";
  const privyUserWallet = getPrivySolanaAddress(user);
  const canAccessScreen = Boolean(
    authenticated || activeWallet || walletAddress || privyUserWallet,
  );
  const resolvedWalletAddress = walletAddress || activeWallet || privyUserWallet;

  useEffect(() => {
    if (activeWallet) {
      setWalletAddress(activeWallet);
      return;
    }
    if (privyUserWallet) {
      setWalletAddress(privyUserWallet);
    }
  }, [activeWallet, privyUserWallet, setWalletAddress]);

  useEffect(() => {
    if (!ready || !walletsReady) {
      return;
    }
    if (!canAccessScreen) {
      router.replace("/");
    }
  }, [canAccessScreen, ready, router, walletsReady]);

  useEffect(() => {
    if (
      registrationGate !== "registered" ||
      !ready ||
      !walletsReady ||
      !resolvedWalletAddress ||
      !canAccessScreen
    ) {
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const [balanceData, dustData, buyQuoteData, purchaseConfig] =
          await Promise.all([
            api.getUserBalance(resolvedWalletAddress),
            api.getDustStatus(resolvedWalletAddress),
            api.getBuyQuote(1),
            api.getPurchaseConfig(),
          ]);

        if (cancelled) {
          return;
        }

        setPurchaseMode(purchaseConfig.operatingMode);

        const goldOz = parseNumber(balanceData.balances.gold);
        const goldPricePerOz = parseNumber(buyQuoteData.goldPricePerOunce);
        const pendingDust = parseNumber(dustData.pendingAmount);
        const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;
        const goldMint = process.env.NEXT_PUBLIC_GOLD_MINT || DEFAULT_DEVNET_GOLD_MINT;
        const [walletUsdcBalance, walletGoldBalance] = await Promise.all([
          getWalletTokenBalance(resolvedWalletAddress, usdcMint),
          getWalletTokenBalance(resolvedWalletAddress, goldMint),
        ]);

        const onChainGoldOz = walletGoldBalance > 0 ? walletGoldBalance : goldOz;
        const totalGoldUsd = onChainGoldOz * goldPricePerOz;

        setDashboardData({
          totalGoldOz: onChainGoldOz,
          totalGoldUsd,
          walletDustUsd: walletUsdcBalance,
          goldPricePerOz,
        });

        setBuyEstimate({
          usdcAmount: buyQuoteData.usdcAmount,
          goldAmount: buyQuoteData.goldAmount,
          stale: buyQuoteData.stale,
          source: buyQuoteData.source,
          updatedAt: buyQuoteData.timestamp,
        });

        setConvertInput((prev) => {
          if (prev.trim().length > 0) {
            return prev;
          }
          return walletUsdcBalance > 0
            ? walletUsdcBalance.toFixed(2)
            : pendingDust > 0
              ? pendingDust.toFixed(2)
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
  }, [
    api,
    canAccessScreen,
    ready,
    registrationGate,
    resolvedWalletAddress,
    walletsReady,
  ]);

  useEffect(() => {
    if (!ready || !walletsReady || !resolvedWalletAddress || !canAccessScreen) {
      return;
    }

    let cancelled = false;

    async function checkRegistrationGate() {
      try {
        const profile = await api.getUserProfile(resolvedWalletAddress);
        if (cancelled) {
          return;
        }
        setRegistrationGate(profile.grailLinked ? "registered" : "unregistered");
      } catch {
        if (!cancelled) {
          setRegistrationGate("unregistered");
        }
      }
    }

    void checkRegistrationGate();

    return () => {
      cancelled = true;
    };
  }, [api, canAccessScreen, ready, resolvedWalletAddress, walletsReady]);

  useEffect(() => {
    if (
      registrationGate !== "registered" ||
      !resolvedWalletAddress ||
      !canAccessScreen ||
      !ready ||
      !walletsReady
    ) {
      return;
    }

    let cancelled = false;

    async function refreshBalances() {
      try {
        const usdcMint = process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;
        const goldMint = process.env.NEXT_PUBLIC_GOLD_MINT || DEFAULT_DEVNET_GOLD_MINT;
        const [walletUsdcBalance, walletGoldBalance, buyQuoteData] = await Promise.all([
          getWalletTokenBalance(resolvedWalletAddress, usdcMint),
          getWalletTokenBalance(resolvedWalletAddress, goldMint),
          api.getBuyQuote(1),
        ]);

        if (cancelled) {
          return;
        }

        setDashboardData((prev) => {
          const totalGoldOz = walletGoldBalance > 0 ? walletGoldBalance : prev.totalGoldOz;
          const goldPricePerOz = parseNumber(buyQuoteData.goldPricePerOunce);
          return {
            ...prev,
            walletDustUsd: walletUsdcBalance,
            totalGoldOz,
            goldPricePerOz,
            totalGoldUsd: totalGoldOz * goldPricePerOz,
          };
        });
      } catch {
        // Keep existing values when periodic refresh fails.
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshBalances();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    api,
    canAccessScreen,
    ready,
    registrationGate,
    resolvedWalletAddress,
    walletsReady,
  ]);

  const convertAmount = useMemo(
    () => parseInputAmount(convertInput),
    [convertInput],
  );
  useEffect(() => {
    if (
      registrationGate !== "registered" ||
      !canAccessScreen ||
      !ready ||
      !walletsReady ||
      convertAmount <= 0
    ) {
      return;
    }

    let cancelled = false;

    async function updateBuyEstimate() {
      try {
        const quote = await api.getBuyQuote(convertAmount);
        if (cancelled) {
          return;
        }
        setBuyEstimate({
          usdcAmount: quote.usdcAmount,
          goldAmount: quote.goldAmount,
          stale: quote.stale,
          source: quote.source,
          updatedAt: quote.timestamp,
        });
        setDashboardData((prev) => ({
          ...prev,
          goldPricePerOz: parseNumber(quote.goldPricePerOunce),
        }));
      } catch {
        // Keep last estimate if a refresh fails.
      }
    }

    const timeoutId = window.setTimeout(() => {
      void updateBuyEstimate();
    }, 250);

    const intervalId = window.setInterval(() => {
      void updateBuyEstimate();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [api, canAccessScreen, convertAmount, ready, registrationGate, walletsReady]);

  const estimatedGold = useMemo(() => {
    if (convertAmount <= 0) {
      return 0;
    }
    return buyEstimate.goldAmount > 0
      ? buyEstimate.goldAmount
      : dashboardData.goldPricePerOz > 0
        ? convertAmount / dashboardData.goldPricePerOz
        : 0;
  }, [buyEstimate.goldAmount, convertAmount, dashboardData.goldPricePerOz]);

  async function handleConfirmDeposit() {
    setError(null);
    setPurchaseActionMessage(null);

    if (!resolvedWalletAddress) {
      setError("Wallet not connected");
      return;
    }

    if (purchaseMode === "custodial") {
      setError(
        "Custodial mode is a temporary fallback. Set PURCHASE_OPERATING_MODE=self_custody to use the primary flow.",
      );
      return;
    }

    if (convertAmount <= 0) {
      setError("Enter a valid USDC amount greater than 0");
      return;
    }

    setCreatingIntent(true);
    try {
      const intent = await api.createSelfPurchaseIntent(
        resolvedWalletAddress,
        convertAmount,
        20,
        true,
        false,
      );
      setPurchaseActionMessage(
        `Intent ${intent.trade.id} created. Sign and submit in wallet to receive gold.`,
      );
    } catch (actionError) {
      setError(formatError(actionError));
    } finally {
      setCreatingIntent(false);
    }
  }

  async function handleRegisterInGrail() {
    setError(null);
    setPurchaseActionMessage(null);

    if (!resolvedWalletAddress) {
      setError("Wallet not connected");
      return;
    }

    setRegisteringUser(true);
    try {
      const result = await api.registerUserInGrail(resolvedWalletAddress);
      setPurchaseActionMessage(
        `GRAIL registration ${result.status}. You can now use self-custody purchase.`,
      );
      setRegistrationGate("registered");
    } catch (registerError) {
      setError(formatError(registerError));
    } finally {
      setRegisteringUser(false);
    }
  }

  if (registrationGate === "checking") {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-frame">
          <div className="dashboard-card">
            <header className="dashboard-topbar">
              <h1 className="dashboard-brand">AURUM</h1>
              <p className="dashboard-wallet-status">
                {resolvedWalletAddress
                  ? shortenWalletAddress(resolvedWalletAddress)
                  : "WALLET DISCONNECTED"}
              </p>
            </header>
            <div className="dashboard-divider" />
            <section className="dashboard-hero">
              <p className="dashboard-kicker">CHECKING GRAIL REGISTRATION</p>
              <p className="dashboard-value">Loading account state...</p>
            </section>
          </div>
        </section>
      </main>
    );
  }

  if (registrationGate === "unregistered") {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-frame">
          <div className="dashboard-card">
            <header className="dashboard-topbar">
              <h1 className="dashboard-brand">AURUM</h1>
              <p className="dashboard-wallet-status">
                {resolvedWalletAddress
                  ? shortenWalletAddress(resolvedWalletAddress)
                  : "WALLET DISCONNECTED"}
              </p>
            </header>

            <div className="dashboard-divider" />

            <section className="dashboard-hero">
              <p className="dashboard-kicker">GRAIL REGISTRATION REQUIRED</p>
              <p className="dashboard-value">Please register your wallet in GRAIL</p>
              <p className="dashboard-held">
                This is required before self-custody purchases.
              </p>
            </section>

            <div className="dashboard-actions" style={{ marginTop: "auto" }}>
              <button
                type="button"
                className="dashboard-button"
                onClick={() => {
                  void handleRegisterInGrail();
                }}
                disabled={registeringUser}
              >
                <span>{registeringUser ? "REGISTERING..." : "REGISTER IN GRAIL"}</span>
                <span aria-hidden="true">→</span>
              </button>
              <p className="dashboard-footer">
                {error
                  ? `ERROR: ${error}`
                  : purchaseActionMessage
                    ? purchaseActionMessage
                    : "COMPLETE REGISTRATION TO CONTINUE"}
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-frame">
        <div className="dashboard-card">
          <header className="dashboard-topbar">
            <h1 className="dashboard-brand">AURUM</h1>
            <p className="dashboard-wallet-status">
              {resolvedWalletAddress
                ? shortenWalletAddress(resolvedWalletAddress)
                : "WALLET DISCONNECTED"}
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
            <p className="dashboard-held">HELD IN YOUR WALLET</p>
          </section>

          <div className="dashboard-divider" />

          <section className="dashboard-stats" aria-label="tokenization stats">
            <article className="dashboard-stat">
              <p className="dashboard-stat-label">USDC BALANCE</p>
              <p className="dashboard-stat-value">
                $
                {dashboardData.walletDustUsd.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </article>
            <article className="dashboard-stat dashboard-stat-right">
              <p className="dashboard-stat-label">GOLD PRICE / OZ</p>
              <p className="dashboard-stat-value">
                $
                {dashboardData.goldPricePerOz.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </article>
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
            <div className="dashboard-meta">
              <div className="dashboard-meta-row">
                <p className="dashboard-meta-label">ESTIMATED GOLD</p>
                <p className="dashboard-meta-value">
                  ~ {estimatedGold.toFixed(6)} OZ
                </p>
              </div>
              <div className="dashboard-meta-row">
                <p className="dashboard-meta-label">NETWORK FEE</p>
                <p className="dashboard-meta-value">
                  ${FALLBACK_NETWORK_FEE_USD.toFixed(2)}
                </p>
              </div>
              <div className="dashboard-meta-row">
                <p className="dashboard-meta-label">EXECUTION</p>
                <p className="dashboard-meta-value">INSTANT</p>
              </div>
            </div>
          </section>

          <div className="dashboard-actions">
            <button
              type="button"
              className="dashboard-button"
              disabled={
                loading || creatingIntent || purchaseMode === "custodial"
              }
              onClick={() => {
                void handleConfirmDeposit();
              }}
            >
              <span>
                {creatingIntent
                  ? "CREATING INTENT..."
                  : purchaseMode === "self_custody"
                    ? "CONVERT TO GOLD"
                    : "CUSTODIAL MODE (DISABLED)"}
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <p className="dashboard-footer">
              {error
                ? `ERROR: ${error}`
                : loading
                  ? "LOADING LIVE DATA"
                  : purchaseActionMessage
                    ? purchaseActionMessage
                    : purchaseMode === "custodial"
                      ? "CUSTODIAL FALLBACK MODE"
                      : buyEstimate.stale
                        ? "QUOTE SOURCE: FALLBACK CACHE"
                        : "POWERED BY GRAIL"}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
