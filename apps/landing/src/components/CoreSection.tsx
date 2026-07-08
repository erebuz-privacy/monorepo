"use client";

import { useRef, useEffect, useState } from "react";
import { ErebuzDiagram } from "./ErebuzDiagram";

const STEPS = [
  "Apps and wallets request a route with findRoute()",
  "The Erebuz SDK finds the optimal path and quotes a routing fee",
  "Privacy : value is shielded through Railgun, StarkNet, Zcash & Monero",
  "Compliance : every route is screened by Chainalysis, Elliptic & TRM Labs",
  "DeFi / Bridges : routed across Stargate, Across, Relay & deBridge",
  "Settlement : all three lanes converge and the transaction is finalized on-chain",
  "One call. Private, compliant, multi-chain settlement.",
]

function TaglineRotator() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % STEPS.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-8 flex items-center justify-center">
      {STEPS.map((t, i) => (
        <p
          key={t}
          className="absolute text-white text-sm md:text-base text-center px-4 transition-all duration-700"
          style={{
            opacity: i === idx ? 1 : 0,
            transform: `translateY(${i === idx ? "0" : "8px"})`,
            pointerEvents: i === idx ? "auto" : "none",
          }}
        >
          {t}
        </p>
      ))}
    </div>
  )
}



export function CoreSection() {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.15 },
    );

    const cards = sectionRef.current?.querySelectorAll("[data-animate]");
    cards?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-20 md:py-28 text-yellow max-w-7xl mx-auto overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-20 left-10 size-64 rounded-full border border-yellow/5 animate-[float-shape_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-40 right-20 size-48 rounded-full border border-cyan/5 animate-[float-shape_25s_ease-in-out_infinite_2s]" />
        <div className="absolute top-60 right-1/4 size-32 rounded-full border border-yellow/5 animate-[float-shape_18s_ease-in-out_infinite_4s]" />
      </div>

      <div className="px-4 relative z-10">
        <div
          id="core-header"
          data-animate
          className="mb-6"
          style={{
            animation: visible["core-header"] ? "pillar-in 0.6s ease-out forwards" : "none",
            opacity: 0,
          }}
        >
          <span className="bg-yellow text-black uppercase px-2 inline-flex mb-6 text-sm tracking-widest">
            CORE
          </span>
          <h2
            className="uppercase font-normal leading-[1.1em] mb-6"
            style={{ fontSize: "clamp(2rem, 6vw, 56px)" }}
          >
            PRIVACY, COMPLIANCE, DEFI in <span className="text-cyan">ONE SDK</span>
          </h2>
        </div>

        <div
          id="flow-diagram"
          data-animate
          className="mt-4 lg:mt-10"
          style={{
            animation: visible["flow-diagram"] ? "pillar-in 0.6s ease-out 0.1s forwards" : "none",
            opacity: 0,
          }}
        >
          <ErebuzDiagram />
        </div>

        <TaglineRotator />

      </div>
    </section>
  );
}
