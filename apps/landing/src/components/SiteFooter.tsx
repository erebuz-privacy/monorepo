import { GithubIcon, XIcon } from "@/components/icons";

const SOCIAL_URLS: Record<string, string> = {
  X: "https://x.com/0xerebuz",
  GitHub: "https://github.com/erebuz-privacy",
};

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

const COLUMNS = {
  Erebuz: ["Home", "Whitepaper", "Roadmap", "Security"],
  Developers: ["Docs", "SDK", "API reference", "TEE runtime"],
  Learn: ["Privacy model", "Comparison", "Use cases", "FAQ"],
  Community: ["X", "GitHub", "Blog"],
};

const SOCIALS = [
  { Icon: XIcon, label: "X", href: SOCIAL_URLS.X },
  { Icon: GithubIcon, label: "GitHub", href: SOCIAL_URLS.GitHub },
];

/** A link that isn't live yet; reveals "Coming soon" on hover. */
function SoonLink({ label }: { label: string }) {
  return (
    <span
      title="Coming soon"
      className="group relative inline-flex cursor-default text-sm text-neutral-400 transition-colors hover:text-white"
    >
      {label}
      <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 whitespace-nowrap border border-white/10 bg-[#141311] px-2 py-1 text-[11px] text-neutral-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        Coming soon
      </span>
    </span>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0b0b0a]">
      <div className="mx-auto max-w-[1400px] px-6 py-16 lg:px-12">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span className="block size-6 bg-white" style={LOGO_MASK} />
              <span className="text-[19px] font-bold tracking-tight">Erebuz</span>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-neutral-500">
              The privacy router for every payment. Private, compliant,
              multi-chain, from one SDK call.
            </p>
            <div className="mt-6 flex gap-3">
              {SOCIALS.map(({ Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex size-9 items-center justify-center border border-white/10 text-neutral-400 transition-colors hover:border-white/40 hover:text-white"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {Object.entries(COLUMNS).map(([title, links]) => (
              <div key={title}>
                <h4 className="mb-5 text-sm font-medium text-neutral-500">
                  {title}
                </h4>
                <ul className="flex flex-col gap-3">
                  {links.map((l) =>
                    SOCIAL_URLS[l] ? (
                      <li key={l}>
                        <a
                          href={SOCIAL_URLS[l]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-neutral-400 transition-colors hover:text-white"
                        >
                          {l}
                        </a>
                      </li>
                    ) : (
                      <li key={l}>
                        <SoonLink label={l} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex items-center justify-between border-t border-white/10 pt-8">
          <p className="text-xs text-neutral-600">© 2026 Erebuz</p>
          <p className="text-xs text-neutral-600">Built for privacy</p>
        </div>
      </div>
    </footer>
  );
}
