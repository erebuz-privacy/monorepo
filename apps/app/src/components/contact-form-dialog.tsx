"use client";

import { useEffect, useState } from "react";

import { Button } from "@erebuz/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@erebuz/ui/components/dialog";
import { Input } from "@erebuz/ui/components/input";
import { Label } from "@erebuz/ui/components/label";

export type ContactFormValue = {
  name: string;
  address: string;
  handle?: string;
};

export function ContactFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ContactFormValue;
  onSubmit: (value: ContactFormValue) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [handle, setHandle] = useState("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(initial?.name ?? "");
    setAddress(initial?.address ?? "");
    setHandle(initial?.handle ?? "");
  }, [open, initial]);

  const valid =
    name.trim().length > 0 && /^0x[a-fA-F0-9]{6,}$/.test(address.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit contact" : "Add a contact"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-address">Wallet address</Label>
            <Input
              id="contact-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-handle">ENS / handle (optional)</Label>
            <Input
              id="contact-handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice.eth"
            />
          </div>

          <Button
            className="w-full"
            disabled={!valid}
            onClick={() => {
              onSubmit({
                name: name.trim(),
                address: address.trim(),
                handle: handle.trim() || undefined,
              });
              onOpenChange(false);
            }}
          >
            {initial ? "Save contact" : "Add contact"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
