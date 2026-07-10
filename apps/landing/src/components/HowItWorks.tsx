import { Section } from "./Section";

const LANES = [
  { name: "Privacy", items: ["Railgun", "StarkNet", "Zcash", "Monero"] },
  { name: "Compliance", items: ["Chainalysis", "Elliptic", "TRM Labs"] },
  { name: "DeFi and bridges", items: ["Stargate", "Across", "Relay", "deBridge"] },
];

export function HowItWorks() {
  return (
    <Section
      id="how"
      label="How it works"
      index="01 / 05"
      heading="One call, three lanes, settled on-chain."
      intro="Your app calls findRoute once. Erebuz shields, screens and routes the value, then settles."
    >
      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-none border border-white/10 bg-white/10 md:grid-cols-3">
        {LANES.map((l, i) => (
          <div key={l.name} className="bg-[#0b0b0a] p-8">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">{l.name}</span>
              <span className="text-xs tabular-nums text-neutral-600">0{i + 1}</span>
            </div>
            <ul className="mt-6 space-y-3">
              {l.items.map((it) => (
                <li key={it} className="flex items-center gap-2.5 text-sm text-neutral-300">
                  <span className="size-1 rounded-none bg-neutral-500" />
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
