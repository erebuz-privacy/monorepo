export function HowItWorks() {
  const steps = [
    { number: "01", title: "Find a route", text: "One request compares the available private settlement paths." },
    { number: "02", title: "Move privately", text: "Erebuz shields the transfer and routes it through the selected provider." },
    { number: "03", title: "Settle on-chain", text: "The recipient receives the quoted asset at the destination address." },
  ];

  return (
    <section id="how" className="border-t border-white/10 px-6 py-24 md:py-32 lg:px-12">
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">How it works</span>
          <span className="tabular-nums text-neutral-600">01 / 05</span>
        </div>
        <div className="mx-auto mt-12 max-w-3xl text-center">
          <h2 className="text-[clamp(2rem,4.2vw,3.25rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            One call, three lanes, settled on-chain.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-neutral-400">
            Your app calls findRoute once. Erebuz shields, screens and routes the
            value, then settles on the destination chain.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
        {steps.map((step) => (
          <article key={step.number} className="bg-[#0b0b0a] p-7 md:p-8">
            <span className="text-xs tabular-nums text-neutral-600">{step.number}</span>
            <h3 className="mt-8 text-xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-3 leading-relaxed text-neutral-400">{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
