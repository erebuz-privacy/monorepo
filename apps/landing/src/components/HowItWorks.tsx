import { ScrollVideo } from "./ScrollVideo";

export function HowItWorks() {
  return (
    <section id="how" className="border-t border-white/10">
      <div className="px-6 pt-24 md:pt-32 lg:px-12">
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
            value, then settles. Scroll to follow it.
          </p>
        </div>
      </div>

      {/* full frame-width, scroll-scrubbed. cropTop / cropBottom = % trimmed. */}
      <ScrollVideo
        src="/diagrams/routing-flow.mp4"
        scroll="500vh"
        cropTop={18}
        cropBottom={12}
        className="mt-10"
      />
    </section>
  );
}
