"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import bs58 from "bs58";
import { ApiClientError } from "@/lib/api/client";
import { createAurumApiService } from "@/lib/api/services";
import { useAuthState } from "@/lib/state/auth-context";

type ActionState = {
  loading: boolean;
  error?: string;
};

type AuthPhase =
  | "initializing"
  | "disconnected"
  | "connected"
  | "authorizing"
  | "authorized"
  | "error";

type SolanaSignMessageWallet = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;
};

function hasSignMessage(wallet: unknown): wallet is SolanaSignMessageWallet {
  if (!wallet || typeof wallet !== "object") {
    return false;
  }
  const candidate = wallet as { signMessage?: unknown };
  return typeof candidate.signMessage === "function";
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

export default function LandingPage() {
  const router = useRouter();
  const api = useMemo(() => createAurumApiService(), []);
  const { walletAddress, setWalletAddress, user, setUser, reset } =
    useAuthState();
  const { ready, login, authenticated, linkWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const [connectState, setConnectState] = useState<ActionState>({
    loading: false,
  });
  const attemptedAutoConnectFor = useRef<string | null>(null);

  const activePrivyWallet = wallets.find(
    (wallet) => wallet.walletClientType === "solana",
  );
  const signingWallet = hasSignMessage(activePrivyWallet)
    ? activePrivyWallet
    : null;
  const activeWallet = activePrivyWallet?.address ?? "";
  const isAuthorized = Boolean(activeWallet && user);

  useEffect(() => {
    if (activeWallet) {
      setWalletAddress(activeWallet);
      return;
    }
    attemptedAutoConnectFor.current = null;
    reset();
  }, [activeWallet, reset, setWalletAddress]);

  useEffect(() => {
    setConnectState((current) =>
      current.error ? { ...current, error: undefined } : current,
    );
  }, [activeWallet]);

  const connectBackend = useCallback(
    async (walletAddr: string) => {
      setConnectState({ loading: true, error: undefined });
      try {
        if (!signingWallet) {
          throw new Error("Connected wallet does not support message signing");
        }

        const { nonce, message } = await api.getAuthNonce(walletAddr);
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = await signingWallet.signMessage(messageBytes);
        const signature = bs58.encode(signatureBytes);
        const data = await api.connectWallet(walletAddr, nonce, signature);

        setUser(data.user);
        setConnectState({ loading: false });
        router.push("/how-it-works");
      } catch (error) {
        setConnectState({ loading: false, error: formatError(error) });
      }
    },
    [api, router, setUser, signingWallet],
  );

  useEffect(() => {
    if (!ready || !walletsReady) {
      return;
    }
    if (!activeWallet || user || connectState.loading || !signingWallet) {
      return;
    }
    if (attemptedAutoConnectFor.current === activeWallet) {
      return;
    }

    attemptedAutoConnectFor.current = activeWallet;
    void connectBackend(activeWallet);
  }, [
    activeWallet,
    connectBackend,
    connectState.loading,
    ready,
    signingWallet,
    user,
    walletsReady,
  ]);

  useEffect(() => {
    if (isAuthorized) {
      router.push("/how-it-works");
    }
  }, [isAuthorized, router]);

  useEffect(() => {
    if (!ready || !walletsReady) {
      return;
    }
    if (activeWallet || authenticated) {
      router.push("/how-it-works");
    }
  }, [activeWallet, authenticated, ready, router, walletsReady]);

  async function handlePrimaryAction() {
    if (connectState.error) {
      setConnectState((current) =>
        current.error ? { ...current, error: undefined } : current,
      );
    }

    if (!ready || !walletsReady) {
      return;
    }

    if (activeWallet && user) {
      router.push("/how-it-works");
      return;
    }

    if (activeWallet && !user) {
      await connectBackend(activeWallet);
      return;
    }

    if (authenticated) {
      try {
        await linkWallet();
      } catch (error) {
        setConnectState({ loading: false, error: formatError(error) });
      }
      return;
    }

    try {
      await login();
    } catch (error) {
      setConnectState({ loading: false, error: formatError(error) });
    }
  }

  const authPhase: AuthPhase = (() => {
    if (!ready || !walletsReady) {
      return "initializing";
    }
    if (connectState.loading) {
      return "authorizing";
    }
    if (connectState.error) {
      return "error";
    }
    if (isAuthorized) {
      return "authorized";
    }
    if (activeWallet) {
      return "connected";
    }
    return "disconnected";
  })();

  const primaryLabel = (() => {
    if (authPhase === "initializing" || authPhase === "authorizing") {
      return "CONNECTING...";
    }
    if (authPhase === "connected") {
      return "AUTHORIZE WALLET";
    }
    if (authPhase === "authorized") {
      return "CONTINUE";
    }
    if (authenticated) {
      return "LINK WALLET";
    }
    return "CONNECT WALLET";
  })();

  const statusLabel = (() => {
    if (authPhase === "initializing") {
      return "Initializing secure wallet";
    }
    if (authPhase === "authorizing") {
      return "Authorizing wallet";
    }
    if (authPhase === "error") {
      return connectState.error;
    }
    if (authPhase === "connected") {
      return "Wallet connected";
    }
    if (authPhase === "authorized") {
      return "Wallet authenticated";
    }
    return "Powered by GRAIL";
  })();

  return (
    <main className="landing-shell">
      <section className="landing-frame">
        <div className="landing-card">
          <div className="landing-spine" aria-hidden="true" />

          <div className="landing-copy">
            <h1 className="landing-title" aria-label="AURUM">
              AURUM
            </h1>
            <p className="landing-tagline">CONVERT DUST INTO GOLD</p>
          </div>

          <div className="landing-actions">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={
                authPhase === "initializing" || authPhase === "authorizing"
              }
              className="landing-button"
            >
              {primaryLabel}
            </button>

            <p
              className={`landing-footer ${
                authPhase === "error" ? "landing-footer-error" : ""
              }`}
            >
              {statusLabel}
            </p>

            {walletAddress ? (
              <p className="landing-wallet">
                {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
