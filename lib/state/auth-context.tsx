"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AurumUser } from "../api/types";

type AuthContextValue = {
  walletAddress: string;
  user: AurumUser | null;
  setWalletAddress: (walletAddress: string) => void;
  setUser: (user: AurumUser | null) => void;
  reset: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [user, setUser] = useState<AurumUser | null>(null);
  const reset = useCallback(() => {
    setWalletAddress("");
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      walletAddress,
      user,
      setWalletAddress,
      setUser,
      reset,
    }),
    [walletAddress, user, reset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthState must be used inside AuthProvider");
  }
  return context;
}
