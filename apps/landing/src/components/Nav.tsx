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
      <div className="mx-auto flex h-[70px] max-w-[1400px] items-center px-6 lg:px-12">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="block size-6 bg-white" style={LOGO_MASK} />
          <span className="text-[19px] font-bold tracking-tight text-white">
            Erebuz
          </span>
        </a>
      </div>
    </header>
  );
}
