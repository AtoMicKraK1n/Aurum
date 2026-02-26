"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import {
  BuyQuoteData,
  ConfirmDepositData,
  CreateDepositIntentData,
  DustStatusData,
  UserBalanceData,
} from "@/lib/api/types";
import { useAuthState } from "@/lib/state/auth-context";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletConnect } from "@/components/wallet/wallet-connect";
import { PublicKey } from "@solana/web3.js";
import { sendUsdcTransfer } from "@/lib/solana/usdc-transfer";

type ActionState = {
  loading: boolean;
  error?: string;
};

function formatError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected request failure";
}

export default function Home() {
  const api = useMemo(() => createAurumApiService(), []);
  const { walletAddress, setWalletAddress, user, setUser, reset } = useAuthState();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [usdcAmount, setUsdcAmount] = useState("1.25");
  const [intentId, setIntentId] = useState("");
  const [txSignature, setTxSignature] = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminKey, setAdminKey] = useState("");

  const [intent, setIntent] = useState<CreateDepositIntentData | null>(null);
  const [buyQuote, setBuyQuote] = useState<BuyQuoteData | null>(null);
  const [confirmData, setConfirmData] = useState<ConfirmDepositData | null>(null);
  const [dustStatus, setDustStatus] = useState<DustStatusData | null>(null);
  const [balance, setBalance] = useState<UserBalanceData | null>(null);

  const [connectState, setConnectState] = useState<ActionState>({ loading: false });
  const [intentState, setIntentState] = useState<ActionState>({ loading: false });
  const [quoteState, setQuoteState] = useState<ActionState>({ loading: false });
  const [confirmState, setConfirmState] = useState<ActionState>({ loading: false });
  const [statusState, setStatusState] = useState<ActionState>({ loading: false });
  const [batchState, setBatchState] = useState<ActionState>({ loading: false });
  const quoteDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (connected && publicKey) {
      setWalletAddress(publicKey.toBase58());
      return;
    }
    reset();
  }, [connected, publicKey, setWalletAddress, reset]);

  const activeWallet = walletAddress;

  async function handleConnect() {
    if (!activeWallet) {
      setConnectState({
        loading: false,
        error: "Connect a wallet first",
      });
      return;
    }

    setConnectState({ loading: true });
    try {
      const data = await api.connectWallet(activeWallet);
      setUser(data.user);
      setConnectState({ loading: false });
    } catch (error) {
      setConnectState({ loading: false, error: formatError(error) });
    }
  }

  async function handleCreateIntent() {
    setIntentState({ loading: true });
    try {
      const data = await api.createDepositIntent(activeWallet, Number(usdcAmount));
      setIntent(data);
      setIntentId(data.intentId);
      setIntentState({ loading: false });
    } catch (error) {
      setIntentState({ loading: false, error: formatError(error) });
    }
  }

  const handleRefreshBuyQuote = useCallback(async () => {
    setQuoteState({ loading: true });
    try {
      const quote = await api.getBuyQuote(Number(usdcAmount));
      setBuyQuote(quote);
      setQuoteState({ loading: false });
    } catch (error) {
      setQuoteState({ loading: false, error: formatError(error) });
    }
  }, [api, usdcAmount]);

  useEffect(() => {
    const amount = Number(usdcAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBuyQuote(null);
      return;
    }

    if (quoteDebounceRef.current) {
      window.clearTimeout(quoteDebounceRef.current);
    }

    quoteDebounceRef.current = window.setTimeout(() => {
      handleRefreshBuyQuote().catch(() => {});
    }, 500);

    return () => {
      if (quoteDebounceRef.current) {
        window.clearTimeout(quoteDebounceRef.current);
      }
    };
  }, [usdcAmount, handleRefreshBuyQuote]);

  async function handleConfirmDeposit() {
    setConfirmState({ loading: true });
    try {
      let signature = txSignature;

      if (!signature) {
        if (!intent) {
          throw new Error("Create deposit intent first");
        }
        if (!publicKey || !connected) {
          throw new Error("Connect wallet first");
        }

        signature = await sendUsdcTransfer({
          connection,
          sendTransaction,
          fromWallet: publicKey,
          toWallet: new PublicKey(intent.recipientWallet),
          mint: new PublicKey(intent.usdcMint),
          amountUi: intent.expectedUsdcAmount,
        });
        setTxSignature(signature);
      }

      const data = await api.confirmDeposit(intentId, signature);
      setConfirmData(data);
      setConfirmState({ loading: false });
    } catch (error) {
      setConfirmState({ loading: false, error: formatError(error) });
    }
  }

  async function handleRefreshStatus() {
    setStatusState({ loading: true });
    try {
      const [dust, userBalance] = await Promise.all([
        api.getDustStatus(activeWallet),
        api.getUserBalance(activeWallet),
      ]);
      setDustStatus(dust);
      setBalance(userBalance);
      setStatusState({ loading: false });
    } catch (error) {
      setStatusState({ loading: false, error: formatError(error) });
    }
  }

  async function handleRunBatch() {
    setBatchState({ loading: true });
    try {
      await api.runBatch(adminKey);
      setBatchState({ loading: false });
      await handleRefreshStatus();
    } catch (error) {
      setBatchState({ loading: false, error: formatError(error) });
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-zinc-900">Aurum App</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Connect wallet, create deposit intent, confirm transfer, then monitor balances and pending batch state.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">1. Connect Wallet</h2>
        <div className="mt-3">
          <WalletConnect onError={(message) => setConnectState({ loading: false, error: message })} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Active wallet for API calls: {activeWallet || "-"}
        </p>
        <button
          onClick={handleConnect}
          disabled={connectState.loading || !connected || !activeWallet}
          className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {connectState.loading ? "Connecting..." : "Connect Wallet"}
        </button>
        {connectState.error ? <p className="mt-2 text-sm text-red-600">{connectState.error}</p> : null}
        {user ? (
          <p className="mt-2 text-xs text-zinc-600">
            Connected user: {user.id} {user.grail_user_id ? "(GRAIL linked)" : "(GRAIL pending)"}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">2. Create Deposit Intent</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            placeholder="USDC amount"
          />
          <button
            onClick={handleCreateIntent}
            disabled={intentState.loading || !activeWallet}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {intentState.loading ? "Creating..." : "Create Intent"}
          </button>
        </div>
        {intentState.error ? <p className="mt-2 text-sm text-red-600">{intentState.error}</p> : null}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleRefreshBuyQuote}
            disabled={quoteState.loading}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-60"
          >
            {quoteState.loading ? "Loading quote..." : "Refresh Buy Quote"}
          </button>
          {quoteState.error ? <p className="text-xs text-red-600">{quoteState.error}</p> : null}
        </div>
        {buyQuote ? (
          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
            <p>
              Est. GOLD: {buyQuote.goldAmount} oz at ${buyQuote.goldPricePerOunce.toFixed(2)}
              /oz
            </p>
            <p>
              Source: {buyQuote.source}
              {buyQuote.stale ? " (stale fallback)" : " (live)"} | {new Date(buyQuote.timestamp).toLocaleString()}
            </p>
          </div>
        ) : null}
        {intent ? (
          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
            <p>Intent ID: {intent.intentId}</p>
            <p>Treasury: {intent.recipientWallet}</p>
            <p>Mint: {intent.usdcMint}</p>
            <p>Expires: {new Date(intent.expiresAt).toLocaleString()}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">3. Confirm Deposit</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Click confirm to send USDC from connected wallet and auto-submit tx signature to backend.
        </p>
        {buyQuote ? (
          <p className="mt-2 text-xs text-zinc-700">
            Quote preview: {buyQuote.usdcAmount} USDC ≈ {buyQuote.goldAmount} GOLD (
            {buyQuote.source}
            {buyQuote.stale ? ", stale" : ", live"})
          </p>
        ) : null}
        <input
          value={intentId}
          onChange={(e) => setIntentId(e.target.value)}
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          placeholder="Intent ID"
        />
        <input
          value={txSignature}
          onChange={(e) => setTxSignature(e.target.value)}
          className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          placeholder="Transfer tx signature (optional manual override)"
        />
        <button
          onClick={handleConfirmDeposit}
          disabled={confirmState.loading || !activeWallet || !intentId}
          className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {confirmState.loading ? "Processing..." : "Send + Confirm Deposit"}
        </button>
        {confirmState.error ? <p className="mt-2 text-sm text-red-600">{confirmState.error}</p> : null}
        {confirmData ? (
          <div className="mt-2 text-xs text-zinc-600">
            <p>
              Confirmed queue ID: {confirmData.queue.id} | Received USDC:{" "}
              {confirmData.receivedUsdcAmount}
            </p>
            <a
              href={`https://explorer.solana.com/tx/${confirmData.txSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-semibold text-zinc-900 underline"
            >
              View transfer tx on Explorer
            </a>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">4. Balance + Pending Status</h2>
          <button
            onClick={handleRefreshStatus}
            disabled={statusState.loading || !activeWallet}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-60"
          >
            {statusState.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        {statusState.error ? <p className="mt-2 text-sm text-red-600">{statusState.error}</p> : null}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-zinc-50 p-3 text-sm">
            <p className="text-xs text-zinc-500">Pending Dust</p>
            <p className="mt-1 font-semibold text-zinc-900">
              {dustStatus?.pendingAmount ?? "-"} ({dustStatus?.queueCount ?? "-"} items)
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3 text-sm">
            <p className="text-xs text-zinc-500">Gold Balance</p>
            <p className="mt-1 font-semibold text-zinc-900">{balance?.balances.gold ?? "-"}</p>
            <p className="mt-1 text-xs text-zinc-500">
              On-chain reference: {balance?.balances.onChainGrailGold ?? "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <input
            type="checkbox"
            checked={adminMode}
            onChange={(e) => setAdminMode(e.target.checked)}
          />
          Admin mode
        </label>

        {adminMode ? (
          <div className="mt-3">
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
              placeholder="Admin API key"
            />
            <button
              onClick={handleRunBatch}
              disabled={batchState.loading}
              className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {batchState.loading ? "Running..." : "Run Batch Now"}
            </button>
            {batchState.error ? <p className="mt-2 text-sm text-red-600">{batchState.error}</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Admin batch trigger is hidden by default.</p>
        )}
      </section>
    </main>
  );
}
