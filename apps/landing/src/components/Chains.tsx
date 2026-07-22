import { Section } from "./Section";

const CHAINS = [
  { name: "Ethereum", img: "/protocols/chains/ethereum.webp" },
  { name: "Arbitrum", img: "/protocols/chains/arbitrum.jpg" },
  { name: "Base", img: "/protocols/chains/base.jpg" },
  { name: "Polygon", img: "/protocols/chains/polygon.jpg" },
  { name: "StarkNet", img: "/protocols/starknet.png" },
  { name: "Optimism", img: "/protocols/chains/optimism.jpg" },
  { name: "Linea", img: "/protocols/chains/linea.png" },
  { name: "Mantle", img: "/protocols/chains/mantle.jpg" },
  { name: "Gnosis", img: "/protocols/chains/gnosis.jpg" },
  { name: "Fuel", img: "/protocols/chains/fuel.jpg" },
  { name: "Manta", img: "/protocols/chains/manta.jpg" },
  { name: "Hyperliquid", img: "/protocols/chains/hyperliquid.jpg" },
  { name: "MegaETH", img: "/protocols/chains/megaeth.jpg" },
  { name: "Unichain", img: "/protocols/chains/unichain.jpg" },
  { name: "World", img: "/protocols/chains/world.jpg" },
];

export function Chains() {
  return (
    <Section
      id="chains"
      label="Coverage"
      index="03 / 05"
      heading="Routed across every chain."
      intro="All chains, from one shared pool, with more added as it grows."
    >
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-none border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-4">
        {CHAINS.map((c) => (
          <div key={c.name} className="flex items-center gap-3 bg-[#0b0b0a] p-5">
            <span className="size-8 shrink-0 overflow-hidden rounded-none border border-white/10 opacity-75 grayscale">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img} alt={c.name} className="size-full object-cover" />
            </span>
            <span className="text-sm text-neutral-300">{c.name}</span>
          </div>
        ))}
        <div className="dot-bg flex items-center gap-3 bg-[#0b0b0a] p-5 text-sm text-neutral-500">
          + more soon
        </div>
      </div>
    </Section>
  );
}
