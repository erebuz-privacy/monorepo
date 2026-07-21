"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { GradientHeading } from "@erebuz/ui/components/gradient-heading";

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

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-1 pt-7 pb-2">
      <h2 className="text-muted-foreground text-sm font-medium">{title}</h2>
      <button
        type="button"
        onClick={onAdd}
        className="press text-brand hover:text-brand/80 flex cursor-pointer items-center gap-1 text-xs font-medium"
      >
        <Plus className="size-3.5" />
        Add
      </button>
    </div>
  );
}

// ── Settings section commented out ─────────────────────────────────
// Everything below is kept for reference but not rendered.
/* eslint-disable */
export default function SettingsPage() {
  // const {
  //   cards,
  //   contacts,
  //   tokenById,
  //   addCard,
  //   updateCard,
  //   removeCard,
  //   addContact,
  //   updateContact,
  //   removeContact,
  // } = useApp();
  //
  // const [cardOpen, setCardOpen] = useState(false);
  // const [editCardId, setEditCardId] = useState<string | null>(null);
  // const [contactOpen, setContactOpen] = useState(false);
  // const [editContactId, setEditContactId] = useState<string | null>(null);
  //
  // const editingCard = editCardId ? cards.find((c) => c.id === editCardId) : undefined;
  // const cardInitial: CardFormValue | undefined = editingCard
  //   ? {
  //       name: editingCard.name,
  //       address: editingCard.address,
  //       chainId: editingCard.chainId,
  //       tokenId: editingCard.tokenId,
  //     }
  //   : undefined;
  //
  // const editingContact = editContactId ? contacts.find((c) => c.id === editContactId) : undefined;
  // const contactInitial: ContactFormValue | undefined = editingContact
  //   ? {
  //       name: editingContact.name,
  //       address: editingContact.address,
  //       handle: editingContact.handle,
  //     }
  //   : undefined;
  //
  // return (
  //   <div className="page-enter mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
  //     <header className="mb-2">
  //       <GradientHeading as="h1" size="md" weight="semi">
  //         Settings
  //       </GradientHeading>
  //       <p className="text-muted-foreground mt-1 text-sm">
  //         Your cards and contacts
  //       </p>
  //     </header>
  //
  //     {/* cards */}
  //     <SectionHeader
  //       title="Cards"
  //       onAdd={() => {
  //         setEditCardId(null);
  //         setCardOpen(true);
  //       }}
  //     />
  //     <section className="border-border divide-border divide-y rounded-2xl border shadow-sm shadow-black/[0.03] dark:shadow-xl dark:shadow-black/20">
  //       {cards.length === 0 ? (
  //         <p className="text-muted-foreground p-6 text-center text-sm">
  //           No cards yet. Add a deposit address you send to often.
  //         </p>
  //       ) : (
  //         cards.map((c) => {
  //           const token = tokenById(c.tokenId);
  //           const chain = chainById(c.chainId);
  //           return (
  //             <div key={c.id} className="flex items-center gap-3 p-4">
  //               <InitialCircle label={c.name} color={c.color} />
  //               <div className="min-w-0 flex-1">
  //                 <p className="truncate text-sm font-medium">{c.name}</p>
  //                 <p className="text-muted-foreground truncate text-xs">
  //                   {token?.symbol} on {chain?.name} · {shortenAddress(c.address)}
  //                 </p>
  //               </div>
  //               <button
  //                 type="button"
  //                 aria-label="Edit card"
  //                 onClick={() => {
  //                   setEditCardId(c.id);
  //                   setCardOpen(true);
  //                 }}
  //                 className="press text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer rounded-md p-2"
  //               >
  //                 <Pencil className="size-4" />
  //               </button>
  //               <button
  //                 type="button"
  //                 aria-label="Delete card"
  //                 onClick={() => removeCard(c.id)}
  //                 className="press text-muted-foreground hover:text-destructive hover:bg-accent cursor-pointer rounded-md p-2"
  //               >
  //                 <Trash2 className="size-4" />
  //               </button>
  //             </div>
  //           );
  //         })
  //       )}
  //     </section>
  //
  //     {/* contacts */}
  //     <SectionHeader
  //       title="Contacts"
  //       onAdd={() => {
  //         setEditContactId(null);
  //         setContactOpen(true);
  //       }}
  //     />
  //     <section className="border-border divide-border divide-y rounded-2xl border shadow-sm shadow-black/[0.03] dark:shadow-xl dark:shadow-black/20">
  //       {contacts.length === 0 ? (
  //         <p className="text-muted-foreground p-6 text-center text-sm">
  //           No contacts yet. Save an address when you send, or add one here.
  //         </p>
  //       ) : (
  //         contacts.map((c) => (
  //           <div key={c.id} className="flex items-center gap-3 p-4">
  //             <GradientAvatar seed={c.address} label={c.name} />
  //             <div className="min-w-0 flex-1">
  //               <p className="truncate text-sm font-medium">{c.name}</p>
  //               <p className="text-muted-foreground truncate text-xs">
  //                 {c.handle ?? shortenAddress(c.address)}
  //               </p>
  //             </div>
  //             <button
  //               type="button"
  //               aria-label="Edit contact"
  //               onClick={() => {
  //                 setEditContactId(c.id);
  //                 setContactOpen(true);
  //               }}
  //               className="press text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer rounded-md p-2"
  //             >
  //               <Pencil className="size-4" />
  //             </button>
  //             <button
  //               type="button"
  //               aria-label="Delete contact"
  //               onClick={() => removeContact(c.id)}
  //               className="press text-muted-foreground hover:text-destructive hover:bg-accent cursor-pointer rounded-md p-2"
  //             >
  //               <Trash2 className="size-4" />
  //             </button>
  //           </div>
  //         ))
  //       )}
  //     </section>
  //
  //     <CardFormDialog
  //       open={cardOpen}
  //       onOpenChange={setCardOpen}
  //       initial={cardInitial}
  //       onSubmit={(value) => {
  //         if (editCardId) updateCard(editCardId, value);
  //         else addCard(value);
  //       }}
  //     />
  //     <ContactFormDialog
  //       open={contactOpen}
  //       onOpenChange={setContactOpen}
  //       initial={contactInitial}
  //       onSubmit={(value) => {
  //         if (editContactId) updateContact(editContactId, value);
  //         else addContact(value);
  //       }}
  //     />
  //   </div>
  // );

  return null;
}
