"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Input } from "@erebuz/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@erebuz/ui/components/tabs";

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
  const { cards, contacts, tokenById } = useApp();
  const [address, setAddress] = useState("");
  const validAddress = /^0x[a-fA-F0-9]{6,}$/.test(address.trim());

  const choose = (dest: Destination) => {
    onSelect(dest);
    onOpenChange(false);
    setAddress("");
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
                          className="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors"
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
                        <GradientAvatar seed={c.address} />
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
              <label className="text-sm font-medium">Wallet address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x…"
                className="mt-2"
              />
              <Button
                className="mt-3 w-full"
                disabled={!validAddress}
                onClick={() =>
                  choose({ kind: "address", address: address.trim() })
                }
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
