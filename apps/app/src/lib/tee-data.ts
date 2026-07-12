"use client";

// Chain + token lists sourced live from the TEE (Relay-backed). Cached at module
// scope so opening the picker again - or the from/to selectors - doesn't refetch.

import { useEffect, useState } from "react";

import { tee, type TeeChain, type TeeToken } from "./tee";

type ChainsState = { chains: TeeChain[]; loading: boolean; error: string | null };
type TokensState = { tokens: TeeToken[]; loading: boolean; error: string | null };

let chainsCache: TeeChain[] | null = null;
let chainsPromise: Promise<TeeChain[]> | null = null;

/** All Relay-bridgeable chains, fetched once and cached. */
export function useChains(): ChainsState {
  const [state, setState] = useState<ChainsState>(() => ({
    chains: chainsCache ?? [],
    loading: !chainsCache,
    error: null,
  }));

  useEffect(() => {
    if (chainsCache) return;
    let alive = true;
    chainsPromise ??= tee.getChains();
    chainsPromise
      .then((c) => {
        chainsCache = c;
        if (alive) setState({ chains: c, loading: false, error: null });
      })
      .catch((e: Error) => {
        chainsPromise = null;
        if (alive) setState({ chains: [], loading: false, error: e.message });
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

const tokensCache = new Map<number, TeeToken[]>();
const tokensPromise = new Map<number, Promise<TeeToken[]>>();

/** Tokens on a chain (deposit-address bridgeable), cached per chain. */
export function useTokens(chainId: number | null): TokensState {
  const [state, setState] = useState<TokensState>(() => ({
    tokens: chainId != null ? (tokensCache.get(chainId) ?? []) : [],
    loading: chainId != null && !tokensCache.has(chainId),
    error: null,
  }));

  useEffect(() => {
    // Syncing local state to the chainId prop + the module token cache - a
    // legitimate external-sync effect (mirrors the store's hydration pattern).
    if (chainId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ tokens: [], loading: false, error: null });
      return;
    }
    if (tokensCache.has(chainId)) {
      setState({ tokens: tokensCache.get(chainId)!, loading: false, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    let p = tokensPromise.get(chainId);
    if (!p) {
      p = tee.getTokens(chainId);
      tokensPromise.set(chainId, p);
    }
    p.then((t) => {
      tokensCache.set(chainId, t);
      if (alive) setState({ tokens: t, loading: false, error: null });
    }).catch((e: Error) => {
      tokensPromise.delete(chainId);
      if (alive) setState({ tokens: [], loading: false, error: e.message });
    });
    return () => {
      alive = false;
    };
  }, [chainId]);

  return state;
}
