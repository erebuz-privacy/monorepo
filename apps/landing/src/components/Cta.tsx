import { DotMountain } from "./DotMountain";
import { DocsButton } from "./DocsButton";
import { WaitlistButton } from "./Waitlist";

export function Cta() {
  return (
    <section className="relative overflow-hidden border-t border-white/10">
      <DotMountain className="pointer-events-none absolute inset-0 -z-10 h-full w-full mask-[radial-gradient(650px_circle_at_50%_45%,black,transparent)]" />
      <div className="px-6 py-32 text-center md:py-44">
        <h2 className="mx-auto max-w-3xl text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[0.98] tracking-[-0.04em]">
          Privacy is infrastructure.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-neutral-400">
          Enable private cross-chain transfers with Erebuz. Get early access to the SDK and ship private,
          compliant transactions in days.
        </p>
        <div className="mx-auto mt-9 flex w-full max-w-sm flex-col justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <WaitlistButton className="inline-flex items-center justify-center rounded-none bg-white px-8 py-4 text-[15px] font-semibold text-black transition-transform hover:scale-[1.02]">
            Get access
          </WaitlistButton>
          <DocsButton className="px-8 py-4">Read the docs</DocsButton>
        </div>
      </div>
    </section>
  );
}
