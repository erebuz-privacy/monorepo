"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Do I need to build anything custom to get privacy?",
    a: "Nope. That's the whole point. You add the SDK, call three methods, and your users get private transactions. The crypto runs underneath. You never touch it.",
  },
  {
    q: "Can regulators still see what's happening?",
    a: "Yes and that's intentional. Every transaction has a compliance score and a sanction check before it moves. You get full privacy for your users and a clean audit trail for regulators. Both, not one or the other.",
  },
  {
    q: "What if Erebuz goes down?",
    a: "Your app runs its own secure box. Your users' keys live there, not with us. If Erebuz goes offline, your box keeps running. You can also self-host the Indexer. We designed it so you never have to trust us completely.",
  },
  {
    q: "How is this different from just using Railgun or Zcash directly?",
    a: "Those are privacy tools. Erebuz is the layer that picks the right tool, runs compliance on top of it, routes across chains, and handles gas, so your users never know any of it happened. Railgun is one of the engines. Erebuz is the car.",
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-yellow/20">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-6 text-left text-yellow transition-colors"
      >
        <span className="text-lg font-normal pr-4">{q}</span>
        <span className={`shrink-0 transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="10" y1="2" x2="10" y2="18" />
            <line x1="2" y1="10" x2="18" y2="10" />
          </svg>
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? "max-h-96 pb-6" : "max-h-0"}`}
      >
        <p className="text-white/80 text-sm md:text-base leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export function GetInvolved() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="container px-4">
        <h2 className="text-yellow mb-10 text-4xl font-normal uppercase md:text-5xl text-center">
          FAQs
        </h2>
        <div className="max-w-3xl mx-auto">
          {faqs.map((faq, i) => (
            <FaqItem
              key={i}
              q={faq.q}
              a={faq.a}
              open={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
