import { Fragment } from "react"
import { Tooltip } from "@/components/ui/tooltip"

interface Cell {
  value: string
  note: string
}

interface Row {
  label: string
  build: Cell
  selfHosted: Cell
  sdk: Cell
}

const rows: Row[] = [
  {
    label: "One year cost",
    build: { value: "$2M–$3.5M", note: "Custom ZK circuits + audits + 2–3 FTE engineers" },
    selfHosted: { value: "$20K–$50K", note: "One-time integration + your own cloud infra" },
    sdk: { value: "$5K–$10K", note: "Plug in the SDK, pay per use" },
  },
  {
    label: "Time to launch",
    build: { value: "12–18 months", note: "From spec to production privacy" },
    selfHosted: { value: "3–6 weeks", note: "Deploy Erebuz on your infra" },
    sdk: { value: "1 day", note: "One API integration, done" },
  },
  {
    label: "Privacy pool",
    build: { value: "Small", note: "Your users only — easy to fingerprint" },
    selfHosted: { value: "Isolated", note: "Your own pool, no cross-tenant leakage" },
    sdk: { value: "Shared", note: "Large pool, maximum anonymity set" },
  },
  {
    label: "Audit risk",
    build: { value: "High, custom crypto", note: "Every ZK circuit is new attack surface" },
    selfHosted: { value: "Integration audit", note: "Only your integration code needs review" },
    sdk: { value: "Low", note: "Battle-tested by thousands of integrations" },
  },
]

function Cell({ cell, className }: { cell: Cell; className?: string }) {
  return (
    <Tooltip content={cell.note}>
      <span className={className}>{cell.value}</span>
    </Tooltip>
  )
}

export function ComparisonSection() {
  return (
    <section
      id="pricing"
      className="flex flex-col relative py-20 md:py-28 xl:flex-row xl:gap-12"
    >
      <div className="xl:container mx-auto px-4">
        <div className="flex flex-col xl:flex-row xl:items-start gap-8 lg:gap-12">
          <div className="xl:w-[380px] shrink-0">
            <span className="text-6xl font-bold text-yellow mb-4 block">02</span>
            <h2 className="uppercase text-3xl md:text-4xl font-normal text-yellow mb-6">
              WHY NOT BUILD IT YOURSELF
            </h2>
            <p className="text-base md:text-lg text-yellow">
              Building custom privacy costs millions and takes a year and creates a small pool that makes users <em>easier</em> to fingerprint. Erebuz removes the custom crypto entirely.
            </p>
          </div>
          <div className="flex-1 min-w-0">
            <div className="overflow-x-auto md:overflow-visible">
              <div className="min-w-[460px] md:min-w-0 border border-yellow/30 rounded-xl">
                <div className="grid grid-cols-4 gap-px bg-yellow/20 [&>:nth-child(4n)]:bg-cyan [&>:nth-child(4n)]:text-black">
                <div className="p-4 bg-black" />
                <div className="p-4 bg-black text-yellow text-xs uppercase font-bold text-center">Build Yourself</div>
                <div className="p-4 bg-black text-yellow text-xs uppercase font-bold text-center">Self-Hosted Erebuz</div>
                <div className="p-4 bg-black text-black text-xs uppercase font-bold text-center">EREBUZ SDK</div>
                {rows.map((row) => (
                  <Fragment key={row.label}>
                    <div className="p-4 bg-black text-yellow text-sm">{row.label}</div>
                    <div className="p-4 bg-black text-yellow/90 text-sm text-center"><Cell cell={row.build} /></div>
                    <div className="p-4 bg-black text-yellow text-sm text-center"><Cell cell={row.selfHosted} /></div>
                    <div className="p-4 bg-black text-black text-sm text-center font-bold"><Cell cell={row.sdk} /></div>
                  </Fragment>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
