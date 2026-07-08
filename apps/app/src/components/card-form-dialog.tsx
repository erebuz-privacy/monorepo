"use client";

import { useEffect, useState } from "react";

import { Button } from "@erebuz/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Input } from "@erebuz/ui/components/input";
import { Label } from "@erebuz/ui/components/label";
import { cn } from "@erebuz/ui/lib/utils";

import { NetworkGlyph, TokenGlyph } from "./crypto-icon";
import { CHAINS } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

export type CardFormValue = {
  name: string;
  address: string;
  chainId: string;
  tokenId: string;
};

export function CardFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CardFormValue;
  onSubmit: (value: CardFormValue) => void;
}) {
  const { tokensForChain } = useApp();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(CHAINS[0].id);
  const [tokenId, setTokenId] = useState("usdc");

  // Reset the form each time the dialog opens (fresh for add, prefilled for edit).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(initial?.name ?? "");
    setAddress(initial?.address ?? "");
    setChainId(initial?.chainId ?? CHAINS[0].id);
    setTokenId(initial?.tokenId ?? "usdc");
  }, [open, initial]);

  const tokens = tokensForChain(chainId);
  const valid =
    name.trim().length > 0 &&
    /^0x[a-fA-F0-9]{6,}$/.test(address.trim()) &&
    tokens.some((t) => t.id === tokenId);

  const setChain = (id: string) => {
    setChainId(id);
    const list = tokensForChain(id);
    if (!list.some((t) => t.id === tokenId)) setTokenId(list[0]?.id ?? "usdc");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit card" : "Add a card"}</DialogTitle>
          <DialogDescription>
            A card is a deposit address plus the token and chain it accepts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="card-name">Card name</Label>
            <Input
              id="card-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gnosis Pay"
            />
          </div>

          <div className="space-y-2">
            <Label>Chain</Label>
            <div className="flex flex-wrap gap-2">
              {CHAINS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChain(c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    chainId === c.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-accent/40"
                  )}
                >
                  <NetworkGlyph chain={c} size={16} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Token accepted</Label>
            <div className="flex flex-wrap gap-2">
              {tokens.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTokenId(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    tokenId === t.id
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-accent/40"
                  )}
                >
                  <TokenGlyph token={t} size={16} />
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-address">Deposit address</Label>
            <Input
              id="card-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
            />
          </div>

          <Button
            className="w-full"
            disabled={!valid}
            onClick={() => {
              onSubmit({ name: name.trim(), address: address.trim(), chainId, tokenId });
              onOpenChange(false);
            }}
          >
            {initial ? "Save card" : "Add card"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
