"use client";

// The confirmed transfer the user is about to execute, carried from the public
// quote screen -> method screen -> transfer screen. Kept in memory (lives in the
// root layout, which persists across client navigations); a hard reload clears
// it and the user re-quotes.

import { createContext, useContext, useMemo, useState } from "react";

import type { CreatedRoute, TeeChain, TeeQuote, TeeToken } from "./tee";

export type RouteDraft = {
  fromChain: TeeChain;
  fromToken: TeeToken;
  toChain: TeeChain;
  /** Destination token (received) — may differ from fromToken. */
  toToken: TeeToken;
  /** Human-readable amount the user entered. */
  amount: string;
  recipientAddress: string;
  quote: TeeQuote;
  /** Set once the route is created (at the method step). */
  created?: CreatedRoute;
};

type RouteDraftContextValue = {
  draft: RouteDraft | null;
  setDraft: (draft: RouteDraft | null) => void;
  patchDraft: (patch: Partial<RouteDraft>) => void;
};

const RouteDraftContext = createContext<RouteDraftContextValue | null>(null);

export function RouteDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<RouteDraft | null>(null);

  const value = useMemo<RouteDraftContextValue>(
    () => ({
      draft,
      setDraft,
      patchDraft: (patch) => setDraft((d) => (d ? { ...d, ...patch } : d)),
    }),
    [draft]
  );

  return <RouteDraftContext.Provider value={value}>{children}</RouteDraftContext.Provider>;
}

export function useRouteDraft(): RouteDraftContextValue {
  const ctx = useContext(RouteDraftContext);
  if (!ctx) throw new Error("useRouteDraft must be used within <RouteDraftProvider>");
  return ctx;
}
