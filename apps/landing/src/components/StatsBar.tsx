import type { ReactNode } from "react";

const STATS: { n: ReactNode; k: string }[] = [
  { n: "$252.8M", k: "Routed privately" },
  { n: "615.2K", k: "Private transfers" },
  { n: "15", k: "Chains supported" },
  {
    n: (
      <>
        98<span className="text-neutral-600">/100</span>
      </>
    ),
    k: "Avg compliance",
  },
];

export function StatsBar() {
  return (
    <div className="border-t border-white/10">
      <div className="grid grid-cols-2 gap-px bg-white/10 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={i} className="bg-[#0b0b0a] p-8">
            <div className="text-[clamp(1.6rem,2.4vw,2.1rem)] font-bold leading-none tabular-nums">
              {s.n}
            </div>
            <div className="mt-2 text-[13.5px] text-neutral-500">{s.k}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
