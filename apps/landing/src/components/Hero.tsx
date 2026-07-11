import { DotMountain } from "./DotMountain";
import { SoonButton } from "./SoonButton";
import { WaitlistButton } from "./Waitlist";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="size-[15px]">
      <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 pb-24 pt-36 text-center lg:px-12"
    >
      <DotMountain className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-55 mask-[linear-gradient(to_top,transparent,black_16%,black)]" />

      <p className="text-sm text-neutral-500">
        The privacy router for every payment
      </p>
      <h1 className="mt-7 max-w-[14ch] text-[clamp(3rem,9vw,7rem)] font-bold leading-[0.92] tracking-[-0.045em]">
        Private, everywhere.
      </h1>
      <p className="mt-8 max-w-xl text-lg leading-relaxed text-neutral-400">
        Private, compliant transfers on every chain. One SDK call, no custom
        crypto.
      </p>
      <div className="mt-9 flex w-full max-w-sm flex-col justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <WaitlistButton className="inline-flex items-center justify-center gap-2 rounded-none bg-white px-6 py-3.5 text-[15px] font-semibold text-black transition-transform hover:scale-[1.02]">
          Get access
          <Arrow />
        </WaitlistButton>
        <SoonButton className="px-6 py-3.5">Read the docs</SoonButton>
      </div>
    </section>
  );
}
