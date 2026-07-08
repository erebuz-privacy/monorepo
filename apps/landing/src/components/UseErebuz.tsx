function WalletIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="18" y="14" width="12" height="8" rx="2" fill="currentColor" opacity="0.15" />
      <circle cx="22" cy="18" r="1.5" fill="currentColor" opacity="0.5" />
      <path d="M6 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M22 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M10 28l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 22h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M28 4L14 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M28 4L20 28l-6-10-10-6 24-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

type Logo = { name: string; src: string }

const walletsLogos: Logo[] = [
  { name: "Metamask", src: "/protocols/Wallets/Metamask.jpg" },
  { name: "OKX", src: "/protocols/Wallets/OKX wallet.jpg" },
  { name: "Rabby", src: "/protocols/Wallets/Rabby wallet.jpg" },
  { name: "Trust", src: "/protocols/Wallets/Trust wallet.jpg" },
  { name: "Coinbase", src: "/protocols/Wallets/coinbase.png" },
  { name: "1inch", src: "/protocols/Wallets/1inch wallet.jpg" },
  { name: "Base", src: "/protocols/Wallets/Base wallet.jpg" },
]

const dexLogos: Logo[] = [
  { name: "Uniswap", src: "/protocols/DEX/uniswap.jpg" },
  { name: "1inch", src: "/protocols/DEX/1inch.jpg" },
  { name: "Curve", src: "/protocols/DEX/Curve Finance.jpg" },
  { name: "Kyber", src: "/protocols/DEX/Kyber Network.jpg" },
  { name: "PancakeSwap", src: "/protocols/DEX/PancakeSwap.jpg" },
  { name: "Sushi", src: "/protocols/DEX/Sushi swap.jpg" },
  { name: "0x", src: "/protocols/DEX/0x.jpg" },
]

const paymentLogos: Logo[] = [
  { name: "Stripe", src: "/protocols/payments/Stripe.jpg" },
  { name: "Coinbase Pay", src: "/protocols/payments/Coinbase Pay.png" },
  { name: "Request", src: "/protocols/payments/Request Network.png" },
  { name: "Safe", src: "/protocols/payments/Safe.jpg" },
  { name: "Avici", src: "/protocols/payments/Avici.jpg" },
  { name: "EtherFi", src: "/protocols/payments/EtherFi.jpg" },
  { name: "Kast", src: "/protocols/payments/Kast.jpg" },
]

function LogoRow({ logos, textColor }: { logos: Logo[]; textColor: string }) {
  return (
    <div className="mt-auto flex items-center gap-2 flex-wrap">
      {logos.map((logo) => (
        <div key={logo.name} className="group relative flex flex-col items-center">
          <div className="size-9 rounded-full border border-current/20 p-0.5 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <div className="size-full rounded-full overflow-hidden bg-black/40">
              <img src={logo.src} alt={logo.name} className="size-full object-cover" />
            </div>
          </div>
          <span className="absolute -bottom-3.5 text-[7px] uppercase tracking-wider whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 text-current/60">
            {logo.name}
          </span>
        </div>
      ))}
    </div>
  )
}

export function UseErebuz() {
  const cards = [
    {
      bg: "bg-yellow",
      textColor: "text-black",
      title: "WALLETS",
      icon: WalletIcon,
      description: "Private transactions with one SDK integration.",
      logos: walletsLogos,
    },
    {
      bg: "bg-cyan",
      textColor: "text-black",
      title: "DEX EXCHANGES",
      icon: SwapIcon,
      description: "Shielded cross-chain swaps with no exposure.",
      logos: dexLogos,
      translate: "lg:translate-y-20",
    },
    {
      bg: "bg-white",
      textColor: "text-black",
      title: "PAYMENT APPS",
      icon: SendIcon,
      description: "Private sends with automatic compliance inbuilt.",
      logos: paymentLogos,
      translate: "lg:translate-y-40",
      border: "border border-black/10",
    },
  ];

  return (
    <section id="use-cases" className="container py-20 md:py-28">
      <h2 className="text-yellow mb-10 text-4xl font-normal uppercase md:text-5xl">
        WHO IT&rsquo;S FOR
      </h2>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`flex h-full flex-col rounded-2xl p-8 ${card.bg} ${card.textColor} ${card.translate} ${card.border ?? ""}`}
            >
              <Icon className="size-8" />
              <h3 className="mt-6 mb-3 text-2xl font-normal uppercase">
                {card.title}
              </h3>
              <p className="text-sm leading-relaxed mb-6">{card.description}</p>
              <LogoRow logos={card.logos} textColor={card.textColor} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
