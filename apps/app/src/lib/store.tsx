"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  SEED_ACTIVITY,
  SEED_CARDS,
  SEED_CONTACTS,
  SEED_TOKENS,
  colorFromString,
  type Activity,
  type Card,
  type Contact,
  type Token,
} from "./mock-data";

export type Custody = "managed" | "self";
export type User = { name: string; email: string };

type Auth = { authed: boolean; custody: Custody | null; user: User | null };

type Snapshot = {
  auth: Auth;
  customTokens: Token[];
  cards: Card[];
  contacts: Contact[];
  activity: Activity[];
};

const STORAGE_KEY = "wall8:v1";

const DEFAULTS: Snapshot = {
  auth: { authed: false, custody: null, user: null },
  customTokens: [],
  cards: SEED_CARDS,
  contacts: SEED_CONTACTS,
  activity: SEED_ACTIVITY,
};

type AppContextValue = Auth & {
  hydrated: boolean;
  tokens: Token[];
  cards: Card[];
  contacts: Contact[];
  activity: Activity[];
  tokenById: (id: string) => Token | undefined;
  tokensForChain: (chainId: string) => Token[];
  // auth
  login: (user: User, custody: Custody) => void;
  chooseCustody: (custody: Custody) => void;
  logout: () => void;
  // data
  recordSend: (activity: Activity) => void;
  importToken: (input: {
    address: string;
    chainId: string;
    symbol?: string;
    name?: string;
  }) => string;
  addCard: (input: Omit<Card, "id" | "color">) => void;
  updateCard: (id: string, patch: Partial<Omit<Card, "id">>) => void;
  removeCard: (id: string) => void;
  addContact: (input: Omit<Contact, "id" | "color">) => void;
  updateContact: (id: string, patch: Partial<Omit<Contact, "id">>) => void;
  removeContact: (id: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

const genId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Snapshot>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state on the client only (SSR can't read localStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setData({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  // Persist whenever data changes (after initial hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, [data, hydrated]);

  const tokens = useMemo(
    () => [...SEED_TOKENS, ...data.customTokens],
    [data.customTokens]
  );

  const tokenById = useCallback(
    (id: string) => tokens.find((t) => t.id === id),
    [tokens]
  );
  const tokensForChain = useCallback(
    (chainId: string) => tokens.filter((t) => t.chains.includes(chainId)),
    [tokens]
  );

  const login = useCallback(
    (user: User, custody: Custody) =>
      setData((d) => ({ ...d, auth: { authed: true, custody, user } })),
    []
  );
  const chooseCustody = useCallback(
    (custody: Custody) =>
      setData((d) => ({ ...d, auth: { ...d.auth, custody } })),
    []
  );
  const logout = useCallback(() => setData(DEFAULTS), []);

  const recordSend = useCallback(
    (entry: Activity) =>
      setData((d) => ({ ...d, activity: [entry, ...d.activity] })),
    []
  );

  const importToken = useCallback(
    (input: {
      address: string;
      chainId: string;
      symbol?: string;
      name?: string;
    }) => {
      const id = `custom-${input.chainId}-${input.address.toLowerCase()}`;
      setData((d) => {
        if (
          d.customTokens.some((t) => t.id === id) ||
          SEED_TOKENS.some((t) => t.id === id)
        ) {
          return d;
        }
        const token: Token = {
          id,
          symbol: (input.symbol || "TOKEN").toUpperCase(),
          name: input.name || "Imported token",
          color: colorFromString(input.address),
          usd: 1,
          chains: [input.chainId],
          address: input.address,
          custom: true,
        };
        return { ...d, customTokens: [...d.customTokens, token] };
      });
      return id;
    },
    []
  );

  const addCard = useCallback(
    (input: Omit<Card, "id" | "color">) =>
      setData((d) => ({
        ...d,
        cards: [
          ...d.cards,
          { ...input, id: genId(), color: colorFromString(input.address) },
        ],
      })),
    []
  );
  const updateCard = useCallback(
    (id: string, patch: Partial<Omit<Card, "id">>) =>
      setData((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    []
  );
  const removeCard = useCallback(
    (id: string) =>
      setData((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) })),
    []
  );

  const addContact = useCallback(
    (input: Omit<Contact, "id" | "color">) =>
      setData((d) => ({
        ...d,
        contacts: [
          ...d.contacts,
          { ...input, id: genId(), color: colorFromString(input.address) },
        ],
      })),
    []
  );
  const updateContact = useCallback(
    (id: string, patch: Partial<Omit<Contact, "id">>) =>
      setData((d) => ({
        ...d,
        contacts: d.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    []
  );
  const removeContact = useCallback(
    (id: string) =>
      setData((d) => ({
        ...d,
        contacts: d.contacts.filter((c) => c.id !== id),
      })),
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ...data.auth,
      hydrated,
      tokens,
      cards: data.cards,
      contacts: data.contacts,
      activity: data.activity,
      tokenById,
      tokensForChain,
      login,
      chooseCustody,
      logout,
      recordSend,
      importToken,
      addCard,
      updateCard,
      removeCard,
      addContact,
      updateContact,
      removeContact,
    }),
    [
      data,
      hydrated,
      tokens,
      tokenById,
      tokensForChain,
      login,
      chooseCustody,
      logout,
      recordSend,
      importToken,
      addCard,
      updateCard,
      removeCard,
      addContact,
      updateContact,
      removeContact,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}
