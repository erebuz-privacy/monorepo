"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";
import { cn } from "@erebuz/ui/lib/utils";

import {
  CardFormDialog,
  type CardFormValue,
} from "@/components/card-form-dialog";
import {
  ContactFormDialog,
  type ContactFormValue,
} from "@/components/contact-form-dialog";
import { GradientAvatar, InitialCircle } from "@/components/crypto-icon";
import { shortenAddress } from "@/lib/format";
import { chainById } from "@/lib/mock-data";
import { useApp } from "@/lib/store";

function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-6">
      <h2 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {title}
      </h2>
      <button
        type="button"
        onClick={onAdd}
        className="text-primary flex items-center gap-1 text-xs font-medium"
      >
        <Plus className="size-3.5" />
        Add
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const {
    user,
    custody,
    chooseCustody,
    logout,
    cards,
    contacts,
    tokenById,
    addCard,
    updateCard,
    removeCard,
    addContact,
    updateContact,
    removeContact,
  } = useApp();

  const [cardOpen, setCardOpen] = useState(false);
  const [editCardId, setEditCardId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    router.replace("/welcome");
  };

  const editingCard = editCardId
    ? cards.find((c) => c.id === editCardId)
    : undefined;
  const cardInitial: CardFormValue | undefined = editingCard
    ? {
        name: editingCard.name,
        address: editingCard.address,
        chainId: editingCard.chainId,
        tokenId: editingCard.tokenId,
      }
    : undefined;

  const editingContact = editContactId
    ? contacts.find((c) => c.id === editContactId)
    : undefined;
  const contactInitial: ContactFormValue | undefined = editingContact
    ? {
        name: editingContact.name,
        address: editingContact.address,
        handle: editingContact.handle,
      }
    : undefined;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Account, security, cards and contacts
        </p>
      </header>

      {/* account */}
      <section className="border-border rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <GradientAvatar
            seed={user?.email ?? "wall8"}
            label={user?.name}
            size={44}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="text-muted-foreground truncate text-xs">
              {user?.email}
            </p>
          </div>
        </div>
      </section>

      {/* security */}
      <h2 className="text-muted-foreground px-1 pb-2 pt-6 text-xs font-medium uppercase tracking-wide">
        Security
      </h2>
      <section className="border-border rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {custody === "self" ? (
              <KeyRound className="text-muted-foreground size-4" />
            ) : (
              <ShieldCheck className="text-brand size-4" />
            )}
            <p className="font-medium">
              {custody === "self" ? "Self-custody" : "Managed wallet"}
            </p>
          </div>
          {custody === "managed" ? (
            <span className="text-brand text-xs font-medium">Gasless</span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {custody === "self"
            ? "You hold the private keys and pay your own gas."
            : "Keys stay inside a TEE enclave and every transfer's gas is sponsored for you."}
        </p>
        <div className="bg-muted mt-4 grid grid-cols-2 gap-1 rounded-lg p-1">
          {(["managed", "self"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => chooseCustody(c)}
              className={cn(
                "rounded-md py-1.5 text-sm font-medium transition-colors",
                custody === c
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {c === "managed" ? "Managed" : "Self-custody"}
            </button>
          ))}
        </div>
      </section>

      {/* cards */}
      <SectionHeader
        title="Cards"
        onAdd={() => {
          setEditCardId(null);
          setCardOpen(true);
        }}
      />
      <section className="border-border divide-border divide-y rounded-xl border">
        {cards.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            No cards yet.
          </p>
        ) : (
          cards.map((c) => {
            const token = tokenById(c.tokenId);
            const chain = chainById(c.chainId);
            return (
              <div key={c.id} className="flex items-center gap-3 p-4">
                <InitialCircle label={c.name} color={c.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {token?.symbol} on {chain?.name} · {shortenAddress(c.address)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Edit card"
                  onClick={() => {
                    setEditCardId(c.id);
                    setCardOpen(true);
                  }}
                  className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-2"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete card"
                  onClick={() => removeCard(c.id)}
                  className="text-muted-foreground hover:text-destructive hover:bg-accent rounded-md p-2"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })
        )}
      </section>

      {/* contacts */}
      <SectionHeader
        title="Contacts"
        onAdd={() => {
          setEditContactId(null);
          setContactOpen(true);
        }}
      />
      <section className="border-border divide-border divide-y rounded-xl border">
        {contacts.length === 0 ? (
          <p className="text-muted-foreground p-4 text-center text-sm">
            No contacts yet.
          </p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <GradientAvatar seed={c.address} label={c.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {c.handle ?? shortenAddress(c.address)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Edit contact"
                onClick={() => {
                  setEditContactId(c.id);
                  setContactOpen(true);
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-2"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Delete contact"
                onClick={() => removeContact(c.id)}
                className="text-muted-foreground hover:text-destructive hover:bg-accent rounded-md p-2"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        )}
      </section>

      <Button
        variant="ghost"
        className="text-destructive hover:text-destructive mt-8 w-full"
        onClick={handleLogout}
      >
        <LogOut className="size-4" />
        Log out
      </Button>

      <CardFormDialog
        open={cardOpen}
        onOpenChange={setCardOpen}
        initial={cardInitial}
        onSubmit={(value) => {
          if (editCardId) updateCard(editCardId, value);
          else addCard(value);
        }}
      />
      <ContactFormDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        initial={contactInitial}
        onSubmit={(value) => {
          if (editContactId) updateContact(editContactId, value);
          else addContact(value);
        }}
      />
    </div>
  );
}
