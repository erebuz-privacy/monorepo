"use client";

import { useState } from "react";
import { Section } from "./Section";

const faqs = [
  {
    q: "Do I need to build anything custom to get privacy?",
    a: "No. You add the SDK, call three methods, and your users get private transactions. The crypto runs underneath, and you never touch it.",
  },
  {
    q: "Can regulators still see what's happening?",
    a: "Yes, and that's intentional. Every transaction is screened before it moves. Full privacy for users, a clean audit trail for regulators.",
  },
  {
    q: "What if Erebuz goes down?",
    a: "Your app runs its own secure enclave. Your users' keys live there, not with us. If Erebuz goes offline, your box keeps running.",
  },
  {
    q: "How is this different from using Railgun or Zcash directly?",
    a: "Those are privacy tools. Erebuz picks the right tool, runs compliance, routes across chains, and handles gas, so users never notice.",
  },
];

function Item({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/10">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-6 py-6 text-left">
        <span className={`text-lg transition-colors ${open ? "text-white" : "text-neutral-300"}`}>
          {q}
        </span>
        <span className={`shrink-0 text-neutral-500 transition-transform duration-300 ${open ? "rotate-45 text-white" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="10" y1="3" x2="10" y2="17" />
            <line x1="3" y1="10" x2="17" y2="10" />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pb-6 text-[15px] leading-relaxed text-neutral-400">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" label="FAQ" index="05 / 05" heading="Questions, answered.">
      <div className="mx-auto max-w-3xl text-left">
        {faqs.map((f, i) => (
          <Item
            key={f.q}
            q={f.q}
            a={f.a}
            open={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
          />
        ))}
      </div>
    </Section>
  );
}
