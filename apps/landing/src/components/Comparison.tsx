import { Section } from "./Section";
import { cn } from "@/lib/utils";

type Cell = { value: string; note: string };
type Row = { label: string; build: Cell; self: Cell; sdk: Cell };

const rows: Row[] = [
  {
    label: "One year cost",
    build: { value: "$2M to $3.5M", note: "Custom ZK circuits, audits, engineers" },
    self: { value: "$20K to $50K", note: "One-time integration on your infra" },
    sdk: { value: "$5K to $10K", note: "Plug in the SDK, pay per use" },
  },
  {
    label: "Time to launch",
    build: { value: "12 to 18 months", note: "Spec to production privacy" },
    self: { value: "3 to 6 weeks", note: "Deploy Erebuz on your infra" },
    sdk: { value: "1 day", note: "One API integration, done" },
  },
  {
    label: "Privacy pool",
    build: { value: "Small", note: "Your users only, easy to fingerprint" },
    self: { value: "Isolated", note: "Your own pool" },
    sdk: { value: "Shared", note: "Large anonymity set" },
  },
  {
    label: "Audit risk",
    build: { value: "High", note: "New ZK attack surface" },
    self: { value: "Integration only", note: "Only your code needs review" },
    sdk: { value: "Low", note: "Battle-tested" },
  },
];

function CellView({ cell, accent }: { cell: Cell; accent?: boolean }) {
  return (
    <div className={cn("px-5 py-5", accent ? "bg-[#131211]" : "bg-[#0b0b0a]")}>
      <span
        className={cn(
          "text-[15px] font-semibold",
          accent ? "text-white" : "text-neutral-500",
        )}
      >
        {cell.value}
      </span>
      <p
        className={cn(
          "mt-1 text-xs leading-snug",
          accent ? "text-neutral-300" : "text-neutral-600",
        )}
      >
        {cell.note}
      </p>
    </div>
  );
}

export function Comparison() {
  return (
    <Section
      id="pricing"
      label="Build vs. buy"
      index="04 / 05"
      heading="Why not build it yourself?"
      intro="Custom privacy costs millions and takes a year. Erebuz removes the custom crypto entirely."
    >
      <div className="overflow-x-auto">
        <div className="grid min-w-[680px] grid-cols-4 gap-px overflow-hidden rounded-none border border-white/10 bg-white/10">
          <div className="bg-[#0b0b0a] px-5 py-4" />
          <div className="bg-[#0b0b0a] px-5 py-4 text-center text-sm font-medium text-neutral-600">
            Build yourself
          </div>
          <div className="bg-[#0b0b0a] px-5 py-4 text-center text-sm font-medium text-neutral-600">
            Self-hosted
          </div>
          <div className="bg-[#131211] px-5 py-4 text-center text-sm font-semibold text-white">
            Erebuz SDK
          </div>

          {rows.map((row) => (
            <div key={row.label} className="contents">
              <div className="flex items-center bg-[#0b0b0a] px-5 py-5 text-sm font-medium text-neutral-500">
                {row.label}
              </div>
              <CellView cell={row.build} />
              <CellView cell={row.self} />
              <CellView cell={row.sdk} accent />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
