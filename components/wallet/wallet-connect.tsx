"use client";

import { useMemo, useState } from "react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";

type WalletConnectProps = {
  onError?: (message: string) => void;
};

export function WalletConnect({ onError }: WalletConnectProps) {
  const { wallets, connected, publicKey, select, connect, disconnect, connecting } =
    useWallet();
  const [selectedWalletName, setSelectedWalletName] = useState<string>("");

  const availableWallets = useMemo(
    () =>
      wallets.filter(
        (wallet) =>
          wallet.readyState === WalletReadyState.Installed ||
          wallet.readyState === WalletReadyState.Loadable,
      ),
    [wallets],
  );

  async function handleConnect() {
    try {
      if (!selectedWalletName && availableWallets.length > 0) {
        const first = availableWallets[0];
        if (first) {
          setSelectedWalletName(first.adapter.name);
          select(first.adapter.name);
        }
      } else {
        const selected = availableWallets.find(
          (wallet) => wallet.adapter.name === selectedWalletName,
        );
        if (selected) {
          select(selected.adapter.name);
        }
      }
      await connect();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Wallet connect failed");
    }
  }

  async function handleDisconnect() {
    try {
      await disconnect();
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "Wallet disconnect failed",
      );
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-2 block text-xs font-semibold text-zinc-700">
          Wallet Provider
        </label>
        <select
          value={selectedWalletName}
          onChange={(e) => {
            const value = e.target.value;
            setSelectedWalletName(value);
            const selected = availableWallets.find(
              (wallet) => wallet.adapter.name === value,
            );
            if (selected) {
              select(selected.adapter.name);
            }
          }}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
        >
          <option value="">Select wallet</option>
          {availableWallets.map((wallet) => (
            <option key={wallet.adapter.name} value={wallet.adapter.name}>
              {wallet.adapter.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        {!connected ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
          >
            Disconnect
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-600">
        {connected && publicKey
          ? `Connected: ${publicKey.toBase58()}`
          : "No wallet connected"}
      </p>
    </div>
  );
}
