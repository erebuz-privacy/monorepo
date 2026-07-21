"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Input } from "@erebuz/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@erebuz/ui/components/tabs";
import { cn } from "@erebuz/ui/lib/utils";

import { GradientAvatar, InitialCircle } from "./crypto-icon";
import { shortenAddress } from "@/lib/format";
import { chainById } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

export type Destination =
  | { kind: "card"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "address"; address: string };

export function DestinationDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (dest: Destination) => void;
}) {
  const { contacts, cards, tokenById, addContact } = useApp();
  const [address, setAddress] = useState("");
  // Offer to save a freshly-typed address to contacts (persisted locally).
  const [saveIt, setSaveIt] = useState(true);
  const [saveName, setSaveName] = useState("");
  // Accept EVM and non-EVM address shapes (Solana, Tron, TON, ...); the TEE
  // validates the exact format against the destination chain.
  const validAddress = /^[A-Za-z0-9:._-]{8,120}$/.test(address.trim());

  const choose = (dest: Destination) => {
    onSelect(dest);
    onOpenChange(false);
    setAddress("");
    setSaveIt(true);
    setSaveName("");
  };

  const continueWithAddress = () => {
    const addr = address.trim();
    // Only save when it's a brand-new address (not one we already have saved).
    const known = contacts.some((c) => c.address.toLowerCase() === addr.toLowerCase());
    if (saveIt && !known) {
      addContact({ name: saveName.trim() || shortenAddress(addr), address: addr });
    }
    choose({ kind: "address", address: addr });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle>Send to</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="cards" className="gap-0">
          <TabsList className="mx-4">
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="address">Address</TabsTrigger>
          </TabsList>

          <div className="max-h-[50vh] overflow-y-auto p-2">
            <TabsContent value="cards">
              {cards.length === 0 ? (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  No cards yet. Add one in Settings.
                </p>
              ) : (
                <ul>
                  {cards.map((c) => {
                    const token = tokenById(c.tokenId);
                    const chain = chainById(c.chainId);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => choose({ kind: "card", id: c.id })}
                          className="press hover:bg-accent flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left"
                        >
                          <InitialCircle label={c.name} color={c.color} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {c.name}
                            </span>
                            <span className="text-muted-foreground block truncate text-xs">
                              {token?.symbol} on {chain?.name} ·{" "}
                              {shortenAddress(c.address)}
                            </span>
                          </span>
                          <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="people">
              {contacts.length === 0 ? (
                <p className="text-muted-foreground p-6 text-center text-sm">
                  No contacts yet. Add one in Settings.
                </p>
              ) : (
                <ul>
                  {contacts.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => choose({ kind: "contact", id: c.id })}
                        className="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
                      >
                        <GradientAvatar seed={c.address} label={c.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {c.name}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {c.handle ?? shortenAddress(c.address)}
                          </span>
                        </span>
                        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="address" className="p-2">
              <label htmlFor="dest-address" className="text-sm font-medium">
                Wallet address
              </label>
              <Input
                id="dest-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x… or any chain address"
                className="mt-2"
              />

              {/* Offer to save a new address locally, so it's one tap next time. */}
              {(() => {
                const addr = address.trim();
                const known = contacts.some(
                  (c) => c.address.toLowerCase() === addr.toLowerCase()
                );
                if (!validAddress) return null;
                if (known) {
                  return (
                    <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
                      <Check className="text-brand size-3.5" />
                      Already in your contacts
                    </p>
                  );
                }
                return (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => setSaveIt((s) => !s)}
                      className="press flex w-full cursor-pointer items-center gap-2 text-left text-sm"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          saveIt
                            ? "border-brand bg-brand text-brand-foreground"
                            : "border-border"
                        )}
                      >
                        {saveIt ? <Check className="size-3" /> : null}
                      </span>
                      Save this address to contacts
                    </button>
                    {saveIt ? (
                      <Input
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Name (optional)"
                      />
                    ) : null}
                  </div>
                );
              })()}

              <Button
                className="mt-3 w-full"
                disabled={!validAddress}
                onClick={continueWithAddress}
              >
                Continue
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
