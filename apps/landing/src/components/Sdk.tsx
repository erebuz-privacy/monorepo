import { Section } from "./Section";
import { SoonButton } from "./SoonButton";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 shrink-0 text-neutral-600">
      <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HANDLES = ["Routing", "Privacy", "Compliance", "Gas"];

export function Sdk() {
  return (
    <Section
      id="sdk"
      label="One SDK call"
      index="02 / 05"
      heading="One master seed. One send()."
      intro="One call handles routing, privacy, compliance and gas. No custom crypto."
    >
      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-none border border-white/10 bg-white/10 lg:grid-cols-2">
        {/* handled-in-one-call list */}
        <div className="flex flex-col bg-[#0b0b0a]">
          <div className="grid grid-cols-2 gap-px bg-white/10">
            {HANDLES.map((h) => (
              <div key={h} className="flex items-center gap-2.5 bg-[#0b0b0a] p-6 text-sm">
                <span className="size-1.5 rounded-none bg-neutral-500" />
                <span className="text-neutral-300">{h}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto p-6 sm:p-8">
            <SoonButton className="px-6 py-3.5">Read the SDK docs</SoonButton>
          </div>
        </div>

        {/* route card */}
        <div className="bg-[#0b0b0a] p-4 sm:p-6">
          <div className="overflow-hidden rounded-none border border-white/10 bg-[#141311]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <span className="text-sm font-medium">erebuz.findRoute()</span>
              <span className="flex items-center gap-2 text-xs text-neutral-400">
                <span className="size-1.5 rounded-none bg-white" />
                Route resolved
              </span>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-none border border-white/10 bg-black/30 p-4 sm:justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-4 rounded-none bg-neutral-300" />
                  Base
                </span>
                <Arrow />
                <span className="rounded-none bg-white px-2.5 py-1 text-xs font-semibold text-black">
                  STRK20 pool
                </span>
                <Arrow />
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-4 rounded-none bg-neutral-300" />
                  Arbitrum
                </span>
              </div>
              <div className="mt-2 divide-y divide-white/10">
                {[
                  ["You send", "100.00 USDC"],
                  ["They receive", "99.58 USDC"],
                  ["Network fee", "$0.42, covered"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-neutral-500">{k}</span>
                    <span className="font-medium tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-none bg-white px-3 py-1 text-xs font-semibold text-black">
                  Private
                </span>
                <span className="rounded-none border border-white/15 px-3 py-1 text-xs text-neutral-300">
                  Compliant 98/100
                </span>
                <span className="rounded-none border border-white/15 px-3 py-1 text-xs text-neutral-300">
                  Settles in 2s
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
