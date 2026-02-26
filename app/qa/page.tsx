"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import { useAuthState } from "@/lib/state/auth-context";

type ApiState = {
  loading: boolean;
  status?: number;
  body?: unknown;
  error?: string;
};

const DEFAULT_BASE_URL = "https://aurum-rodf.onrender.com";
const DEFAULT_WALLET = "5UCaKTTMTPaYgmPL45cU1ay5GAjHjqvXXq7VpNPu84rf";

export default function QaPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const { walletAddress, setWalletAddress, setUser } = useAuthState();
  const [usdcAmount, setUsdcAmount] = useState("1.25");
  const [intentId, setIntentId] = useState("");
  const [txSignature, setTxSignature] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [result, setResult] = useState<ApiState>({ loading: false });

  const api = useMemo(() => createAurumApiService(baseUrl), [baseUrl]);
  const inputClass =
    "mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-300";

  useEffect(() => {
    if (!walletAddress) {
      setWalletAddress(DEFAULT_WALLET);
    }
  }, [walletAddress, setWalletAddress]);

  async function runRequest<T>(request: () => Promise<T>) {
    setResult({ loading: true });
    try {
      const data = await request();
      setResult({
        loading: false,
        status: 200,
        body: data,
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setResult({
          loading: false,
          status: error.status,
          body: error.body,
          error: error.message,
        });
        return;
      }

      setResult({
        loading: false,
        error: error instanceof Error ? error.message : "Unknown request error",
      });
    }
  }

  function submitConnect(e: FormEvent) {
    e.preventDefault();
    runRequest(async () => {
      const data = await api.connectWallet(walletAddress);
      setUser(data.user);
      return data;
    });
  }

  function submitCreateIntent(e: FormEvent) {
    e.preventDefault();
    runRequest(async () => {
      const data = await api.createDepositIntent(walletAddress, Number(usdcAmount));
      setIntentId(data.intentId);
      return data;
    });
  }

  function submitConfirmIntent(e: FormEvent) {
    e.preventDefault();
    runRequest(() => api.confirmDeposit(intentId, txSignature));
  }

  function submitStatus(e: FormEvent) {
    e.preventDefault();
    runRequest(() => api.getDustStatus(walletAddress));
  }

  function submitBalance(e: FormEvent) {
    e.preventDefault();
    runRequest(() => api.getUserBalance(walletAddress));
  }

  function submitBatchRun(e: FormEvent) {
    e.preventDefault();
    runRequest(() => api.runBatch(adminKey));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Aurum QA Panel</h1>
        <p className="mt-1 text-sm text-zinc-700">
          Lightweight endpoint tester for auth, deposits, batch, and balances.
        </p>
        <p className="mt-2 text-xs text-zinc-700">
          Test order: Connect Wallet {"->"} Create Intent {"->"} Send USDC in
          wallet {"->"} Confirm Deposit {"->"} Run Batch {"->"} Check Balance.
        </p>
        <a
          href="/QA_TESTING.md"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-zinc-900 underline"
        >
          Open Full QA Guide
        </a>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-zinc-900">
          Base URL
        </label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className={inputClass.replace("mb-3 ", "")}
          placeholder="https://aurum-rodf.onrender.com"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <form
          onSubmit={submitConnect}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            1. Connect Wallet
          </h2>
          <p className="mb-2 text-xs text-zinc-600">
            Fill only the wallet address (devnet).
          </p>
          <input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className={inputClass}
            placeholder="Wallet address"
          />
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            POST /api/auth/connect
          </button>
        </form>

        <form
          onSubmit={submitCreateIntent}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            2. Create Deposit Intent
          </h2>
          <p className="mb-2 text-xs text-zinc-600">
            Uses wallet + USDC amount and returns an intent ID.
          </p>
          <input
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value)}
            className={inputClass}
            placeholder="USDC amount"
          />
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            POST /api/deposits/create-intent
          </button>
        </form>

        <form
          onSubmit={submitConfirmIntent}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            3. Confirm Deposit
          </h2>
          <p className="mb-2 text-xs text-zinc-600">
            Requires intent ID and real transfer tx signature.
          </p>
          <input
            value={intentId}
            onChange={(e) => setIntentId(e.target.value)}
            className={inputClass}
            placeholder="Intent ID"
          />
          <input
            value={txSignature}
            onChange={(e) => setTxSignature(e.target.value)}
            className={inputClass}
            placeholder="Transfer tx signature"
          />
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            POST /api/deposits/confirm
          </button>
        </form>

        <form
          onSubmit={submitBatchRun}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            4. Run Batch (Admin)
          </h2>
          <p className="mb-2 text-xs text-zinc-600">
            Requires admin API key in header.
          </p>
          <input
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className={inputClass}
            placeholder="Admin API key"
          />
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            POST /api/admin/batch/run
          </button>
        </form>

        <form
          onSubmit={submitStatus}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            5. Dust Status
          </h2>
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            GET /api/dust/status
          </button>
        </form>

        <form
          onSubmit={submitBalance}
          className="rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            6. User Balance
          </h2>
          <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            GET /api/user/balance
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-300 bg-zinc-900 p-4 text-zinc-100 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Latest Response</h2>
          {result.loading ? (
            <span className="text-xs text-zinc-300">Loading...</span>
          ) : null}
        </div>
        {result.error ? (
          <p className="text-sm text-red-300">{result.error}</p>
        ) : (
          <pre className="max-h-[360px] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
            {JSON.stringify(
              {
                status: result.status,
                body: result.body,
              },
              null,
              2,
            )}
          </pre>
        )}
      </section>
    </main>
  );
}
