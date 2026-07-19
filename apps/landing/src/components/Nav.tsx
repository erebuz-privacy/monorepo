const LOGO_MASK = {
  maskImage: "url(/images/erebuz-logo.svg)",
  WebkitMaskImage: "url(/images/erebuz-logo.svg)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
} as const;

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-[70px] max-w-[1400px] items-center justify-between px-6 lg:px-12">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="block size-6 bg-white" style={LOGO_MASK} />
          <span className="text-[19px] font-bold tracking-tight text-white">
            Erebuz
          </span>
        </a>
        <a
          href="https://deck.erebuz.com"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 border border-white/15 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-white/40 hover:text-white"
        >
          Deck
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-3.5 text-neutral-500 transition-colors group-hover:text-white"
          >
            <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </header>
  );
}
