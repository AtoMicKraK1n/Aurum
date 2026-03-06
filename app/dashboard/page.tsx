"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import { useAuthState } from "@/lib/state/auth-context";

const DEFAULT_SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";
const DEFAULT_DEVNET_USDC_MINT = "8METbBgV5CSyorAaW5Lm42dbWdE8JU9vfBiM67TK9Mp4";
const DEFAULT_DEVNET_GOLD_MINT = "Cu5rvMuh9asSHyCtof81B8sYU8iM62MgaWVVZnQDDZst";
const DEFAULT_SELF_PURCHASE_SLIPPAGE_PERCENT = 40;
const FALLBACK_NETWORK_FEE_SOL = 0.000005;
const DEFAULT_EXPLORER_CLUSTER = "devnet";

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

function formatSmartBalance(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const isZero = Math.abs(safeValue) < 1e-12;
  return safeValue.toLocaleString(undefined, {
    minimumFractionDigits: isZero ? 2 : 4,
    maximumFractionDigits: isZero ? 2 : 4,
  });
}

function sanitizeDashboardErrorMessage(raw: string): string {
  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (
    lower.includes("positivefloat must be greater than 0") ||
    lower.includes("body.goldamount")
  ) {
    return "Amount is too low. Please enter a higher USDC amount (>0.006) .";
  }

  if (lower.includes("slippage exceeded")) {
    return "Price moved too much for current slippage. Try again.";
  }

  if (lower.includes("user not found")) {
    return "Wallet is not registered in GRAIL. Please register and retry.";
  }

  if (lower.includes("failed to submit transaction")) {
    return "Transaction submit failed. Please try again.";
  }

  const compact = normalized.split(" | ")[0].trim();
  if (!compact) {
    return "Unexpected request failure";
  }
  if (compact.length > 180) {
    return `${compact.slice(0, 177)}...`;
  }
  return compact;
}

function formatError(error: unknown): string {
  if (typeof error === "string") {
    return sanitizeDashboardErrorMessage(error);
  }
  if (error instanceof ApiClientError) {
    return sanitizeDashboardErrorMessage(error.message);
  }
  if (error instanceof Error) {
    return sanitizeDashboardErrorMessage(error.message);
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

function getExplorerTxUrl(signature: string): string {
  const cluster =
    process.env.NEXT_PUBLIC_SOLANA_EXPLORER_CLUSTER || DEFAULT_EXPLORER_CLUSTER;
  return `https://explorer.solana.com/tx/${signature}?cluster=${encodeURIComponent(cluster)}`;
}

type BuyEstimateState = {
  usdcAmount: number;
  goldAmount: number;
  stale: boolean;
  source: "grail_live" | "fallback_cache";
  updatedAt: string;
};

type PendingSelfPurchaseIntent = {
  tradeId: string;
  serializedTx: string;
  usdcAmount: number;
  estimatedGold: number;
  networkFeeSol: number;
};

type AutoSweepSettingsState = {
  enabled: boolean;
  minSweepUsdc: number;
  maxSweepUsdc: number;
  slippagePercent: number;
  cooldownMinutes: number;
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

function base64ToBytes(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

type SolanaSignerProvider = {
  signTransaction: (
    transaction: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>;
};

function hasSignTransactionProvider(
  value: unknown,
): value is SolanaSignerProvider {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { signTransaction?: unknown };
  return typeof candidate.signTransaction === "function";
}

type WalletWithProviderCandidates = {
  getProvider?: () => Promise<unknown>;
  getSolanaProvider?: () => Promise<unknown>;
  provider?: unknown;
  signTransaction?: (
    tx: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>;
};

async function resolveWalletSignerProvider(
  wallet: unknown,
): Promise<SolanaSignerProvider | null> {
  if (!wallet || typeof wallet !== "object") {
    return null;
  }

  const candidate = wallet as WalletWithProviderCandidates;

  if (typeof candidate.signTransaction === "function") {
    return {
      signTransaction: candidate.signTransaction.bind(candidate),
    };
  }

  if (typeof candidate.getProvider === "function") {
    const provider = await candidate.getProvider();
    if (hasSignTransactionProvider(provider)) {
      return provider;
    }
  }

  if (typeof candidate.getSolanaProvider === "function") {
    const provider = await candidate.getSolanaProvider();
    if (hasSignTransactionProvider(provider)) {
      return provider;
    }
  }

  if (hasSignTransactionProvider(candidate.provider)) {
    return candidate.provider;
  }

  return null;
}

type InjectedSolanaProvider = {
  signTransaction?: (
    tx: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>;
  connect?: () => Promise<unknown>;
  isConnected?: boolean;
  publicKey?: { toBase58?: () => string };
};

async function resolveInjectedSignerProvider(
  preferredAddress: string,
): Promise<SolanaSignerProvider | null> {
  const w = window as unknown as {
    solana?: InjectedSolanaProvider;
    solflare?: InjectedSolanaProvider;
    phantom?: { solana?: InjectedSolanaProvider };
  };

  const injectedCandidates: Array<InjectedSolanaProvider | undefined> = [
    w.solana,
    w.solflare,
    w.phantom?.solana,
  ];

  for (const candidate of injectedCandidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const walletAddress =
      typeof candidate.publicKey?.toBase58 === "function"
        ? candidate.publicKey.toBase58()
        : "";
    const addressMatches = !walletAddress || walletAddress === preferredAddress;

    if (!addressMatches) {
      continue;
    }

    if (!candidate.isConnected && typeof candidate.connect === "function") {
      try {
        await candidate.connect();
      } catch {
        // Continue trying other providers.
      }
    }

    if (hasSignTransactionProvider(candidate)) {
      console.log("[dashboard][sign-debug] selected injected signer", {
        address: walletAddress || "unknown",
      });
      return candidate;
    }
  }

  return null;
}

async function resolveSignerProviderFromWallets(
  walletList: unknown[],
  preferredAddress: string,
): Promise<SolanaSignerProvider | null> {
  const candidates = walletList.filter(
    (wallet): wallet is { address?: string } =>
      Boolean(wallet) && typeof wallet === "object",
  );

  const ordered = [
    ...candidates.filter((wallet) => wallet.address === preferredAddress),
    ...candidates.filter((wallet) => wallet.address !== preferredAddress),
  ];

  for (const wallet of ordered) {
    const probe = wallet as {
      address?: string;
      getProvider?: unknown;
      getSolanaProvider?: unknown;
      signTransaction?: unknown;
      provider?: unknown;
      walletClientType?: unknown;
    };
    console.log("[dashboard][sign-debug] probing wallet", {
      address: probe.address || "",
      walletClientType: probe.walletClientType,
      hasGetProvider: typeof probe.getProvider === "function",
      hasGetSolanaProvider: typeof probe.getSolanaProvider === "function",
      hasDirectSignTransaction: typeof probe.signTransaction === "function",
      hasProviderObject: Boolean(probe.provider),
      providerHasSignTransaction: hasSignTransactionProvider(probe.provider),
    });

    const signer = await resolveWalletSignerProvider(wallet);
    if (signer) {
      console.log("[dashboard][sign-debug] selected signer wallet", {
        address: probe.address || "",
      });
      return signer;
    }
  }

  return null;
}

function deserializeAnyTransaction(
  serializedTxBase64: string,
): Transaction | VersionedTransaction {
  const bytes = base64ToBytes(serializedTxBase64);
  try {
    return Transaction.from(bytes);
  } catch {
    return VersionedTransaction.deserialize(bytes);
  }
}

async function estimateNetworkFeeSolFromSerializedTx(
  serializedTxBase64: string,
): Promise<number> {
  try {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL;
    const connection = new Connection(rpcUrl);
    const tx = deserializeAnyTransaction(serializedTxBase64);

    const feeResult =
      tx instanceof Transaction
        ? await connection.getFeeForMessage(tx.compileMessage())
        : await connection.getFeeForMessage(tx.message);

    const lamports = feeResult.value ?? 0;
    if (!Number.isFinite(lamports) || lamports <= 0) {
      return FALLBACK_NETWORK_FEE_SOL;
    }

    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return FALLBACK_NETWORK_FEE_SOL;
  }
}

async function getWalletTokenBalance(
  walletAddress: string,
  mintAddress: string,
): Promise<number> {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_SOLANA_RPC_URL;

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
  const { walletAddress, setWalletAddress, reset } = useAuthState();
  const { ready, authenticated, user, logout } = usePrivy();
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
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [registeringUser, setRegisteringUser] = useState(false);
  const [registrationGate, setRegistrationGate] =
    useState<RegistrationGate>("checking");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [successTxSignature, setSuccessTxSignature] = useState<string | null>(
    null,
  );
  const [networkFeeSol, setNetworkFeeSol] = useState(FALLBACK_NETWORK_FEE_SOL);
  const [buyEstimate, setBuyEstimate] = useState<BuyEstimateState>({
    usdcAmount: 0,
    goldAmount: 0,
    stale: false,
    source: "grail_live",
    updatedAt: "",
  });
  const [pendingIntent, setPendingIntent] =
    useState<PendingSelfPurchaseIntent | null>(null);
  const [signatureCopied, setSignatureCopied] = useState(false);
  const [autoSweepSettings, setAutoSweepSettings] =
    useState<AutoSweepSettingsState>({
      enabled: false,
      minSweepUsdc: 1,
      maxSweepUsdc: 25,
      slippagePercent: 20,
      cooldownMinutes: 30,
    });
  const [savingAutoSweep, setSavingAutoSweep] = useState(false);
  const [isSweepModalOpen, setIsSweepModalOpen] = useState(false);
  const [sweepDraft, setSweepDraft] = useState<AutoSweepSettingsState>({
    enabled: true,
    minSweepUsdc: 1,
    maxSweepUsdc: 25,
    slippagePercent: 20,
    cooldownMinutes: 30,
  });

  const activePrivyWallet = wallets.find(
    (wallet) => wallet.walletClientType === "solana",
  );
  const activeWallet = activePrivyWallet?.address ?? "";
  const privyUserWallet = getPrivySolanaAddress(user);
  const canAccessScreen = Boolean(
    authenticated || activeWallet || walletAddress || privyUserWallet,
  );
  const resolvedWalletAddress =
    walletAddress || activeWallet || privyUserWallet;

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
        const [
          balanceData,
          dustData,
          buyQuoteData,
          purchaseConfig,
          dustSweepSettings,
        ] = await Promise.all([
          api.getUserBalance(resolvedWalletAddress),
          api.getDustStatus(resolvedWalletAddress),
          api.getBuyQuote(1),
          api.getPurchaseConfig(),
          api.getDustSweepSettings(resolvedWalletAddress),
        ]);

        if (cancelled) {
          return;
        }

        setPurchaseMode(purchaseConfig.operatingMode);

        const goldOz = parseNumber(balanceData.balances.gold);
        const goldPricePerOz = parseNumber(buyQuoteData.goldPricePerOunce);
        const pendingDust = parseNumber(dustData.pendingAmount);
        const usdcMint =
          process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;
        const goldMint =
          process.env.NEXT_PUBLIC_GOLD_MINT || DEFAULT_DEVNET_GOLD_MINT;
        const [walletUsdcBalance, walletGoldBalance] = await Promise.all([
          getWalletTokenBalance(resolvedWalletAddress, usdcMint),
          getWalletTokenBalance(resolvedWalletAddress, goldMint),
        ]);

        const onChainGoldOz =
          walletGoldBalance > 0 ? walletGoldBalance : goldOz;
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

        setAutoSweepSettings({
          enabled: dustSweepSettings.enabled,
          minSweepUsdc: dustSweepSettings.minSweepUsdc,
          maxSweepUsdc: dustSweepSettings.maxSweepUsdc,
          slippagePercent: dustSweepSettings.slippagePercent,
          cooldownMinutes: dustSweepSettings.cooldownMinutes,
        });
        setSweepDraft({
          enabled: true,
          minSweepUsdc: dustSweepSettings.minSweepUsdc,
          maxSweepUsdc: dustSweepSettings.maxSweepUsdc,
          slippagePercent: dustSweepSettings.slippagePercent,
          cooldownMinutes: dustSweepSettings.cooldownMinutes,
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
    refreshNonce,
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
        setRegistrationGate(
          profile.grailLinked ? "registered" : "unregistered",
        );
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
        const usdcMint =
          process.env.NEXT_PUBLIC_USDC_MINT || DEFAULT_DEVNET_USDC_MINT;
        const goldMint =
          process.env.NEXT_PUBLIC_GOLD_MINT || DEFAULT_DEVNET_GOLD_MINT;
        const [walletUsdcBalance, walletGoldBalance, buyQuoteData] =
          await Promise.all([
            getWalletTokenBalance(resolvedWalletAddress, usdcMint),
            getWalletTokenBalance(resolvedWalletAddress, goldMint),
            api.getBuyQuote(1),
          ]);

        if (cancelled) {
          return;
        }

        setDashboardData((prev) => {
          const totalGoldOz =
            walletGoldBalance > 0 ? walletGoldBalance : prev.totalGoldOz;
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
    refreshNonce,
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
  }, [
    api,
    canAccessScreen,
    convertAmount,
    ready,
    registrationGate,
    walletsReady,
  ]);

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
        DEFAULT_SELF_PURCHASE_SLIPPAGE_PERCENT,
        {
          coSign: false,
          userAsFeePayer: true,
        },
      );
      const resolvedNetworkFeeSol = await estimateNetworkFeeSolFromSerializedTx(
        intent.serializedTx,
      );
      setNetworkFeeSol(resolvedNetworkFeeSol);
      setPendingIntent({
        tradeId: intent.trade.id,
        serializedTx: intent.serializedTx,
        usdcAmount: convertAmount,
        estimatedGold,
        networkFeeSol: resolvedNetworkFeeSol,
      });
    } catch (actionError) {
      setError(formatError(actionError));
    } finally {
      setCreatingIntent(false);
    }
  }

  async function handleSignAndSubmitIntent() {
    if (!pendingIntent) {
      return;
    }

    setError(null);
    setPurchaseActionMessage(null);

    setSubmittingPurchase(true);
    try {
      if (!resolvedWalletAddress) {
        throw new Error("Wallet not connected");
      }

      console.log("[dashboard][sign-debug] submit start", {
        resolvedWalletAddress,
        walletCount: wallets.length,
        walletAddresses: wallets.map((wallet) => wallet.address || ""),
      });

      const signerProvider = await resolveSignerProviderFromWallets(
        wallets,
        resolvedWalletAddress,
      );
      const provider =
        signerProvider ||
        (await resolveInjectedSignerProvider(resolvedWalletAddress));
      if (!provider) {
        throw new Error(
          "No connected Solana wallet with transaction signing support found. Reconnect Solflare wallet.",
        );
      }

      const tx = deserializeAnyTransaction(pendingIntent.serializedTx);
      const signedTx = await provider.signTransaction(tx);
      const signedSerializedTx = bytesToBase64(signedTx.serialize());

      const submitResult = await api.submitSelfPurchase(
        pendingIntent.tradeId,
        signedSerializedTx,
      );

      setPendingIntent(null);
      setSuccessTxSignature(submitResult.txSignature);
      setPurchaseActionMessage(
        `Purchase complete. Tx: ${submitResult.txSignature.slice(0, 8)}...${submitResult.txSignature.slice(-8)}`,
      );
      setRefreshNonce((prev) => prev + 1);
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setSubmittingPurchase(false);
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

  async function saveAutoSweepSettings(
    next: AutoSweepSettingsState,
  ): Promise<boolean> {
    if (!resolvedWalletAddress) {
      setError("Wallet not connected");
      return false;
    }

    setSavingAutoSweep(true);
    setError(null);
    try {
      const saved = await api.upsertDustSweepSettings({
        walletAddress: resolvedWalletAddress,
        enabled: next.enabled,
        minSweepUsdc: next.minSweepUsdc,
        maxSweepUsdc: next.maxSweepUsdc,
        slippagePercent: next.slippagePercent,
        cooldownMinutes: next.cooldownMinutes,
      });

      setAutoSweepSettings({
        enabled: saved.enabled,
        minSweepUsdc: saved.minSweepUsdc,
        maxSweepUsdc: saved.maxSweepUsdc,
        slippagePercent: saved.slippagePercent,
        cooldownMinutes: saved.cooldownMinutes,
      });
      setPurchaseActionMessage(
        saved.enabled
          ? `Auto sweep enabled at ${saved.minSweepUsdc.toFixed(2)} USDC threshold`
          : "Auto sweep disabled",
      );
      return true;
    } catch (sweepError) {
      setError(formatError(sweepError));
      return false;
    } finally {
      setSavingAutoSweep(false);
    }
  }

  async function handleToggleAutoSweep() {
    if (autoSweepSettings.enabled) {
      await saveAutoSweepSettings({
        ...autoSweepSettings,
        enabled: false,
      });
      return;
    }

    setSweepDraft({
      ...autoSweepSettings,
      enabled: true,
    });
    setIsSweepModalOpen(true);
  }

  function handleOpenSweepModal() {
    setSweepDraft({
      ...autoSweepSettings,
      enabled: true,
    });
    setIsSweepModalOpen(true);
  }

  async function handleSaveSweepModal() {
    if (
      !Number.isFinite(sweepDraft.minSweepUsdc) ||
      sweepDraft.minSweepUsdc <= 0
    ) {
      setError("Threshold must be a positive USDC amount");
      return;
    }

    if (
      !Number.isFinite(sweepDraft.slippagePercent) ||
      sweepDraft.slippagePercent <= 0
    ) {
      setError("Slippage must be greater than 0");
      return;
    }

    const next = {
      enabled: true,
      minSweepUsdc: Number(sweepDraft.minSweepUsdc.toFixed(6)),
      maxSweepUsdc: Math.max(
        Number(sweepDraft.minSweepUsdc.toFixed(6)),
        Number(sweepDraft.maxSweepUsdc.toFixed(6)),
      ),
      slippagePercent: Number(sweepDraft.slippagePercent.toFixed(2)),
      cooldownMinutes: Math.max(0, Math.floor(sweepDraft.cooldownMinutes)),
    };

    const saved = await saveAutoSweepSettings(next);
    if (saved) {
      setIsSweepModalOpen(false);
    }
  }

  async function handleBrandHome() {
    await logout();
    reset();
    router.replace("/");
  }

  if (registrationGate === "checking") {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-frame">
          <div className="dashboard-card">
            <header className="dashboard-topbar">
              <button
                type="button"
                className="dashboard-brand dashboard-brand-button"
                onClick={() => {
                  void handleBrandHome();
                }}
              >
                AURUM
              </button>
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
              <button
                type="button"
                className="dashboard-brand dashboard-brand-button"
                onClick={() => {
                  void handleBrandHome();
                }}
              >
                AURUM
              </button>
              <p className="dashboard-wallet-status">
                {resolvedWalletAddress
                  ? shortenWalletAddress(resolvedWalletAddress)
                  : "WALLET DISCONNECTED"}
              </p>
            </header>

            <div className="dashboard-divider" />

            <section className="dashboard-hero">
              <p className="dashboard-kicker">GRAIL REGISTRATION REQUIRED</p>
              <p className="dashboard-value">
                Please register your wallet in GRAIL
              </p>
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
                <span>
                  {registeringUser ? "REGISTERING..." : "REGISTER IN GRAIL"}
                </span>
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
            <button
              type="button"
              className="dashboard-brand dashboard-brand-button"
              onClick={() => {
                void handleBrandHome();
              }}
            >
              AURUM
            </button>
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
              {formatSmartBalance(dashboardData.totalGoldOz)}
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
                ${formatSmartBalance(dashboardData.walletDustUsd)}
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
                  ~ {(pendingIntent?.networkFeeSol ?? networkFeeSol).toFixed(6)}{" "}
                  SOL
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
                loading ||
                creatingIntent ||
                submittingPurchase ||
                purchaseMode === "custodial"
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
          </div>

          <div className="dashboard-divider" />

          <section className="dashboard-sweep">
            <div className="dashboard-sweep-head">
              <p className="dashboard-sweep-title">• AUTO SWEEP</p>
              <button
                type="button"
                role="switch"
                aria-checked={autoSweepSettings.enabled}
                className={`dashboard-sweep-toggle ${
                  autoSweepSettings.enabled ? "is-on" : ""
                }`}
                onClick={() => {
                  void handleToggleAutoSweep();
                }}
                disabled={savingAutoSweep}
              >
                <span className="dashboard-sweep-knob" />
              </button>
            </div>
            <button
              type="button"
              className="dashboard-sweep-configure"
              onClick={handleOpenSweepModal}
              disabled={savingAutoSweep}
            >
              CONFIGURE →
            </button>
          </section>

          <p className="dashboard-footer">POWERED BY GRAIL</p>

          {isSweepModalOpen ? (
            <div className="dashboard-sign-overlay">
              <div className="dashboard-sign-modal dashboard-sweep-basic-modal">
                <h2 className="dashboard-sign-title">Auto Sweep Settings</h2>
                <div className="dashboard-sweep-basic-fields">
                  <label className="dashboard-sweep-basic-field">
                    <span>THRESHOLD (USDC)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={sweepDraft.minSweepUsdc}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSweepDraft((prev) => ({
                          ...prev,
                          minSweepUsdc: Number.isFinite(value)
                            ? value
                            : prev.minSweepUsdc,
                        }));
                      }}
                    />
                  </label>

                  <label className="dashboard-sweep-basic-field">
                    <span>SLIPPAGE (%)</span>
                    <input
                      type="number"
                      min={0.1}
                      step="0.1"
                      value={sweepDraft.slippagePercent}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSweepDraft((prev) => ({
                          ...prev,
                          slippagePercent: Number.isFinite(value)
                            ? value
                            : prev.slippagePercent,
                        }));
                      }}
                    />
                  </label>

                  <label className="dashboard-sweep-basic-field">
                    <span>COOLDOWN (MIN)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={sweepDraft.cooldownMinutes}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setSweepDraft((prev) => ({
                          ...prev,
                          cooldownMinutes: Number.isFinite(value)
                            ? value
                            : prev.cooldownMinutes,
                        }));
                      }}
                    />
                  </label>
                </div>

                <p className="dashboard-sweep-basic-note">
                  Next sweep at balance ≥ {sweepDraft.minSweepUsdc.toFixed(2)}{" "}
                  USDC
                </p>

                <button
                  type="button"
                  className="dashboard-sign-confirm"
                  disabled={savingAutoSweep}
                  onClick={() => {
                    void handleSaveSweepModal();
                  }}
                >
                  {savingAutoSweep ? "SAVING..." : "SAVE SETTINGS"}
                </button>
                <button
                  type="button"
                  className="dashboard-sign-cancel"
                  disabled={savingAutoSweep}
                  onClick={() => {
                    setIsSweepModalOpen(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {pendingIntent ? (
            <div className="dashboard-sign-overlay">
              <div className="dashboard-sign-modal">
                <h2 className="dashboard-sign-title">Confirm Transaction</h2>
                <p className="dashboard-sign-subtitle">
                  Review transaction details
                </p>

                <div className="dashboard-sign-row">
                  <p className="dashboard-sign-label">Amount</p>
                  <p className="dashboard-sign-value">
                    {pendingIntent.usdcAmount.toFixed(3)} USDC
                  </p>
                </div>
                <div className="dashboard-sign-row">
                  <p className="dashboard-sign-label">Est. Gold</p>
                  <p className="dashboard-sign-value">
                    ~{pendingIntent.estimatedGold.toFixed(6)} OZ
                  </p>
                </div>

                <div className="dashboard-sign-spacer" />

                <div className="dashboard-sign-row dashboard-sign-row-small">
                  <p className="dashboard-sign-label">Network fee</p>
                  <p className="dashboard-sign-value">
                    {pendingIntent.networkFeeSol.toFixed(6)} SOL
                  </p>
                </div>
                <div className="dashboard-sign-row dashboard-sign-row-small">
                  <p className="dashboard-sign-label">Execution</p>
                  <p className="dashboard-sign-value">Instant</p>
                </div>

                <button
                  type="button"
                  className="dashboard-sign-confirm"
                  disabled={submittingPurchase}
                  onClick={() => {
                    void handleSignAndSubmitIntent();
                  }}
                >
                  {submittingPurchase
                    ? "SIGNING & SUBMITTING..."
                    : "CONFIRM TRANSACTION"}
                </button>

                <button
                  type="button"
                  className="dashboard-sign-cancel"
                  disabled={submittingPurchase}
                  onClick={() => {
                    setPendingIntent(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {successTxSignature ? (
            <div className="dashboard-sign-overlay">
              <div className="dashboard-sign-modal dashboard-success-modal">
                <div className="dashboard-success-hero">
                  <p className="dashboard-success-badge" aria-hidden="true"></p>
                  <h2 className="dashboard-sign-title">
                    Transaction Confirmed
                  </h2>
                  <p className="dashboard-sign-subtitle">
                    Your gold purchase was successful on Solana.
                  </p>
                </div>

                <div className="dashboard-success-detail">
                  <p className="dashboard-sign-label">Transaction Signature</p>
                  <div className="dashboard-success-signature-row">
                    <p className="dashboard-success-signature">
                      {successTxSignature.slice(0, 8)}...
                      {successTxSignature.slice(-8)}
                    </p>
                    <button
                      type="button"
                      className="dashboard-success-copy"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(successTxSignature)
                          .then(() => {
                            setSignatureCopied(true);
                            window.setTimeout(() => {
                              setSignatureCopied(false);
                            }, 1200);
                          })
                          .catch(() => {
                            setError("Failed to copy signature");
                          });
                      }}
                    >
                      {signatureCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <a
                  className="dashboard-sign-confirm dashboard-sign-link"
                  href={getExplorerTxUrl(successTxSignature)}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on Explorer
                </a>

                <button
                  type="button"
                  className="dashboard-sign-cancel"
                  onClick={() => {
                    setSuccessTxSignature(null);
                    setSignatureCopied(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
