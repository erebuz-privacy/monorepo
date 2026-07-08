import Link from "next/link";

const FOOTER_LINKS = {
  Erebuz: [
    { label: "Home", href: "/" },
    { label: "Whitepaper", href: "/whitepaper" },
    { label: "Roadmap", href: "/roadmap" },
    { label: "Security", href: "/security" },
  ],
  Community: [
    { label: "X", href: "https://x.com/erebuz" },
    { label: "Discord", href: "https://discord.gg/erebuz" },
    { label: "GitHub", href: "https://github.com/erebuz" },
    { label: "Blog", href: "/blog" },
  ],
  Developers: [
    { label: "Docs", href: "/docs" },
    { label: "SDK", href: "/sdk" },
    { label: "API Reference", href: "/api" },
    { label: "TEE Runtime", href: "/tee" },
  ],
  Learn: [
    { label: "Privacy Model", href: "/privacy-model" },
    { label: "Comparison", href: "/comparison" },
    { label: "Use Cases", href: "/use-cases" },
    { label: "FAQ", href: "/faq" },
  ],
};

const isExternal = (href: string) => href.startsWith("http");

export function Footer() {
  return (
    <footer className="border-t border-yellow/20">
      <div className="container mx-auto px-4 py-16">
        <h2 className="uppercase text-3xl font-normal text-yellow mb-10">
          PRIVACY IS INFRASTRUCTURE
        </h2>
        <nav className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 className="uppercase text-sm tracking-wider text-yellow/80 mb-6 font-light">
                {title}
              </h4>
              <ul className="flex flex-col gap-3">
                {links.map((link) => (
                  <li key={link.href}>
                    {isExternal(link.href) ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-lg md:text-3xl uppercase text-yellow hover:text-cyan transition-colors break-words"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-lg md:text-3xl uppercase text-yellow hover:text-cyan transition-colors break-words"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-16">
          <p className="text-yellow/80 text-sm">© 2026 Erebuz</p>
        </div>
      </div>
    </footer>
  );
}