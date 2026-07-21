"use client";

import { useState } from "react";

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

import { NetworkGlyph } from "./crypto-icon";
import { CHAINS } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

export function ImportTokenDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (tokenId: string, chainId: string) => void;
}) {
  const { importToken } = useApp();
  const [address, setAddress] = useState("");
  const [symbol, setSymbol] = useState("");
  const [chainId, setChainId] = useState(CHAINS[0].id);

  const valid = /^0x[a-fA-F0-9]{6,}$/.test(address.trim());

  const reset = () => {
    setAddress("");
    setSymbol("");
    setChainId(CHAINS[0].id);
  };

  const submit = () => {
    if (!valid) return;
    const id = importToken({
      address: address.trim(),
      chainId,
      symbol: symbol.trim() || undefined,
    });
    onImported(id, chainId);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import a token</DialogTitle>
          <DialogDescription>
            Add a token that isn&apos;t listed by its contract address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Chain</Label>
            <div className="flex flex-wrap gap-2">
              {CHAINS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChainId(c.id)}
                  className={cn(
                    "press flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium",
                    chainId === c.id
                      ? "border-brand bg-brand/10 text-brand"
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
            <Label htmlFor="token-address">Token contract address</Label>
            <Input
              id="token-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="token-symbol">Symbol (optional)</Label>
            <Input
              id="token-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. PYUSD"
            />
          </div>

          <Button className="w-full" disabled={!valid} onClick={submit}>
            Import token
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
