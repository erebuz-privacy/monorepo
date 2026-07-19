import { useState, useEffect, useRef, Fragment } from 'react';
import Deck from './deck/Deck';
import Slide from './deck/Slide';
import Build from './deck/Build';
import Reveal from './deck/Reveal';
import Team from './components/Team';

function AnimatedCount({ to, prefix, suffix }: { to: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      const from = 0;
      const dur = 1200;
      const t0 = performance.now();
      let raf = requestAnimationFrame(function tick(now) {
        const p = Math.min(1, (now - t0) / dur);
        setVal(from + (to - from) * (1 - Math.pow(1 - p, 5)));
        if (p < 1) raf = requestAnimationFrame(tick);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [to]);
  return <>{prefix}{val.toLocaleString('en-US', { maximumFractionDigits: 0 })}{suffix}</>;
}

const CHAINS = [
  { name: 'Ethereum', img: '/protocols/ethereum.webp' },
  { name: 'Arbitrum', img: '/protocols/arbitrum.jpg' },
  { name: 'Base', img: '/protocols/base.jpg' },
  { name: 'Polygon', img: '/protocols/polygon.jpg' },
  { name: 'StarkNet', img: '/protocols/starknet.png' },
  { name: 'Optimism', img: '/protocols/optimism.jpg' },
  { name: 'Linea', img: '/protocols/linea.png' },
  { name: 'Mantle', img: '/protocols/mantle.jpg' },
];

export default function App() {
  return (
    <Deck>
      {/* 1. Cover */}
      <Slide
        center
        nav="Cover"
        notes="Open with the one-liner: Private, everywhere. Hold."
      >
        <Reveal>
          <img
            src="/erebuz-logo.svg"
            alt="Erebuz"
            style={{ width: 64, height: 64, marginBottom: 24, filter: 'brightness(0) invert(0.96)' }}
          />
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="display" style={{ fontSize: 'clamp(52px, 9vw, 120px)' }}>
            EREBUZ
          </h1>
        </Reveal>
        <Reveal delay={0.26}>
          <div
            style={{
              marginTop: 'clamp(24px, 4vh, 40px)',
              fontSize: 'clamp(13px, 1.2vw, 15px)',
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)',
            }}
          >
            The best private payment router for every crypto transaction
          </div>
        </Reveal>
      </Slide>

      {/* 2. Analogy */}
      <Slide center nav="Analogy" notes="Stripe : Erebuz. Hook them. Then show the market sizing.">
        <Reveal>
          <h2
            className="headline"
            style={{
              textAlign: 'center',
              marginInline: 'auto',
              marginBottom: 'clamp(24px, 4vh, 40px)',
              maxWidth: '22ch',
            }}
          >
            What Stripe did for payments,
            <br />
            Erebuz does for crypto.
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'clamp(16px, 3vw, 48px)',
              flexWrap: 'wrap',
              marginBottom: 'clamp(28px, 5vh, 48px)',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <img src="/protocols/stripe.jpg" alt="Stripe" style={{ height: 'clamp(36px, 4vw, 52px)', display: 'block', borderRadius: '50%', border: '1px solid var(--hair)' }} />
              <div style={{ color: 'var(--fg-muted)', fontSize: 'clamp(13px, 1.3vw, 15px)', marginTop: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fiat</div>
            </div>
            <div style={{ color: 'var(--hair)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 200, lineHeight: 1 }}>|</div>
            <div style={{ textAlign: 'center' }}>
              <img src="/erebuz-logo.svg" alt="Erebuz" style={{ height: 'clamp(36px, 4vw, 52px)', display: 'block' }} />
              <div style={{ color: 'var(--fg-muted)', fontSize: 'clamp(13px, 1.3vw, 15px)', marginTop: 10, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Crypto</div>
            </div>
          </div>
        </Reveal>
        <Build at={1}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 640, marginInline: 'auto' }}>
            {[
              { label: 'Total Addressable Market', value: <><AnimatedCount to={85} suffix="T+" prefix="$" /></>, offset: 0 },
              { label: 'Serviceable Addressable Market', value: <><AnimatedCount to={4} suffix="T" prefix="$" /></>, offset: 36 },
              { label: 'Serviceable Obtainable Market', value: <><AnimatedCount to={25} suffix="M" prefix="$" /></>, offset: 72 },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{
                  width: `calc(100% - ${item.offset}px)`,
                  marginLeft: item.offset,
                  marginTop: i > 0 ? -1 : 0,
                }}
              >
                <div
                  style={{
                    padding: 'clamp(18px, 2.2vh, 26px) clamp(24px, 3vw, 40px)',
                    border: '1px solid var(--hair)',
                    borderLeft: '2px solid var(--fg)',
                    background: i === 0 ? 'transparent' : i === 1 ? 'color-mix(in srgb, var(--fg) 3%, transparent)' : 'color-mix(in srgb, var(--fg) 5%, transparent)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 24,
                  }}
                >
                  <span style={{ fontSize: 'clamp(15px, 1.5vw, 20px)', fontWeight: 500, color: 'var(--fg)' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 700, letterSpacing: '-0.03em', fontFeatureSettings: '"tnum" 1', whiteSpace: 'nowrap' }}>
                    {item.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Build>
      </Slide>

      {/* 3. Problem — visual + logos */}
      <Slide center nav="Problem" notes="Three problems visualized with protocol logos. The + shows they compound.">
        <Reveal>
          <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 8 }}>
            Problem
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="lead" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(24px, 4vh, 40px)', maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 'clamp(14px, 1.5vw, 20px)' }}>
            Choosing the best route for any crypto payment is still hard.
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(8px, 1.2vw, 16px)', width: '100%', maxWidth: 900, marginInline: 'auto' }}>
            {[
              {
                title: 'Privacy',
                logos: ['railgun.jpg', 'starknet.png', 'zcash.jpg', 'monero.jpg'],
              },
              {
                title: 'Compliance',
                logos: ['chainalaysis.png', 'Elliptic.jpg', 'TRM.jpg'],
              },
              {
                title: 'DeFi / Bridges',
                logos: ['relay.jpg', 'across.jpg', 'stargate.png', 'debridge.jpg'],
              },
            ].map((section, i) => (
              <div key={section.title} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {i > 0 && (
                  <span style={{ color: 'var(--fg-muted)', fontSize: 'clamp(22px, 2.6vw, 34px)', fontWeight: 600, marginInline: 'clamp(6px, 1vw, 14px)', lineHeight: 1 }}>
                    +
                  </span>
                )}
                <div className="mat" style={{ flex: 1, padding: 'clamp(24px, 2.8vw, 36px)', borderRadius: 0, textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: 600, color: 'var(--fg)', marginBottom: 20 }}>
                    {section.title}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, justifyItems: 'center', maxWidth: 200, marginInline: 'auto' }}>
                    {section.logos.map((logo) => (
                      <div
                        key={logo}
                        style={{
                          width: 84,
                          height: 84,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          border: '1px solid var(--hair-2)',
                          opacity: 0.5,
                          filter: 'grayscale(1)',
                        }}
                      >
                        <img
                          src={`/protocols/${logo}`}
                          alt={logo.split('.')[0]}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {i === 2 && (
                  <span style={{ color: 'var(--fg-muted)', fontSize: 'clamp(22px, 2.6vw, 34px)', fontWeight: 600, marginInline: 'clamp(6px, 1vw, 14px)', lineHeight: 1 }}>
                    =
                  </span>
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </Slide>

      {/* 4. How it works — routing flow video */}
      <Slide center nav="How it works" notes="One call, three lanes, settled on-chain.">
        <Reveal>
          <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 8 }}>
            EREBUZ<span style={{ color: 'var(--fg-muted)' }}>?</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="lead" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(16px, 2.5vh, 28px)', maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 'clamp(14px, 1.5vw, 20px)' }}>
            Erebuz sits between your wallet and the app and handles everything in between.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <div style={{ width: '100%', marginInline: 'auto', maxWidth: 800 }}>
            <video
              autoPlay
              muted
              loop
              playsInline
              style={{ width: '100%', display: 'block' }}
              aria-label="Erebuz routing flow"
            >
              <source src="/diagrams/routing-flow.webm" type="video/webm" />
              <source src="/diagrams/routing-flow.mp4" type="video/mp4" />
            </video>
          </div>
        </Reveal>
      </Slide>

      {/* 5. Build vs Buy */}
      <Slide center nav="Comparison" notes="The comparison table. SD column wins every row.">
        <Reveal delay={0.06}>
          <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(16px, 2.5vh, 28px)', whiteSpace: 'nowrap' }}>
            Why not build it yourself?
          </h2>
        </Reveal>
        <Reveal>
          <div style={{ maxWidth: 720, width: '100%', marginInline: 'auto', fontSize: 'clamp(12px, 1.1vw, 14px)' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr', border: '1px solid var(--hair)', borderBottom: 'none' }}>
              <div style={{ background: 'var(--bg)', padding: 'clamp(10px, 1.2vh, 14px) clamp(12px, 1.4vw, 18px)' }} />
              {[
                { title: 'Build yourself', accent: false },
                { title: 'Self-hosted', accent: false },
                { title: 'Erebuz SDK', accent: true },
              ].map((col) => (
                <div
                  key={col.title}
                  style={{
                    padding: 'clamp(10px, 1.2vh, 14px) clamp(10px, 1.2vw, 16px)',
                    textAlign: 'center',
                    fontWeight: col.accent ? 600 : 500,
                    fontSize: 'clamp(11px, 1vw, 13px)',
                    color: col.accent ? 'var(--fg)' : 'var(--fg-muted)',
                    background: col.accent ? 'var(--surface-2)' : 'var(--bg)',
                    borderLeft: '1px solid var(--hair)',
                  }}
                >
                  {col.title}
                </div>
              ))}
            </div>

            {/* Data rows */}
            {[
              {
                label: 'One year cost',
                build: { value: '$2M to $3.5M', note: 'Custom ZK circuits, audits, engineers' },
                self: { value: '$20K to $50K', note: 'One-time integration on your infra' },
                sdk: { value: '$5K to $10K', note: 'Plug in the SDK, pay per use' },
              },
              {
                label: 'Time to launch',
                build: { value: '12 to 18 months', note: 'Spec to production privacy' },
                self: { value: '3 to 6 weeks', note: 'Deploy Erebuz on your infra' },
                sdk: { value: '1 day', note: 'One API integration, done' },
              },
              {
                label: 'Privacy pool',
                build: { value: 'Small', note: 'Your users only, easy to fingerprint' },
                self: { value: 'Isolated', note: 'Your own pool' },
                sdk: { value: 'Shared', note: 'Large anonymity set' },
              },
              {
                label: 'Audit risk',
                build: { value: 'High', note: 'New ZK attack surface' },
                self: { value: 'Integration only', note: 'Only your code needs review' },
                sdk: { value: 'Low', note: 'Battle-tested' },
              },
            ].map((row, ri) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1fr 1.2fr',
                  border: '1px solid var(--hair)',
                  borderTop: ri > 0 ? 'none' : undefined,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: 'clamp(10px, 1.2vh, 14px) clamp(12px, 1.4vw, 18px)',
                    fontSize: 'clamp(12px, 1.1vw, 13px)',
                    color: 'var(--fg-muted)',
                    fontWeight: 500,
                    background: 'var(--bg)',
                  }}
                >
                  {row.label}
                </div>
                {(['build', 'self', 'sdk'] as const).map((key) => {
                  const cell = row[key];
                  const accent = key === 'sdk';
                  return (
                    <div
                      key={key}
                      style={{
                        padding: 'clamp(10px, 1.2vh, 14px) clamp(10px, 1.2vw, 16px)',
                        textAlign: 'center',
                        background: accent ? 'var(--surface-2)' : 'var(--bg)',
                        borderLeft: '1px solid var(--hair)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'clamp(13px, 1.2vw, 15px)',
                          fontWeight: 600,
                          color: accent ? 'var(--fg)' : 'var(--fg-muted)',
                          marginBottom: 2,
                        }}
                      >
                        {cell.value}
                      </div>
                      <div
                        style={{
                          fontSize: 'clamp(10px, 0.85vw, 11px)',
                          color: accent ? 'var(--fg-muted)' : 'var(--fg-faint)',
                          lineHeight: 1.4,
                        }}
                      >
                        {cell.note}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Reveal>
      </Slide>

      {/* 6. SDK — code screenshot visual */}
      <Slide center nav="SDK" notes="Show the code. One call handles everything.">
        <Reveal delay={0.06}>
          <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 6 }}>
            One call handles everything.
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="lead" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(20px, 3vh, 34px)' }}>
            Routing, privacy, compliance and gas.
          </p>
        </Reveal>
        <Reveal>
          <div
            style={{
              maxWidth: 560,
              marginInline: 'auto',
              border: '1px solid var(--hair)',
              overflow: 'hidden',
            }}
          >
            <img
              src="/assets/sdk-code.png"
              alt="Erebuz SDK code example"
              style={{ width: '100%', display: 'block' }}
            />
          </div>
        </Reveal>
      </Slide>

      {/* 8. Roadmap */}
      <Slide nav="Roadmap" notes="Now / Next / Later. We're live.">
        <div className="container">
          <Reveal delay={0.06}>
            <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(32px, 5vh, 52px)' }}>
              What's next.
            </h2>
          </Reveal>
          <div style={{ maxWidth: 900, marginInline: 'auto', display: 'flex', gap: '1px', background: 'var(--hair)' }}>
            {[
              { time: 'Now', title: 'SDK live', body: 'First integrations. Core routing shipped.', icon: 'play' },
              { time: 'Next', title: 'Scale', body: '10+ partners. Multi-chain routing.', icon: 'trend' },
              { time: 'Later', title: 'Full stack', body: 'Category default for private payments.', icon: 'layers' },
            ].map((item, i) => (
              <Reveal key={item.time} delay={0.1 + i * 0.08} style={{ flex: 1, display: 'flex' }}>
                <div
                  style={{
                    flex: 1,
                    background: 'var(--bg)',
                    padding: 'clamp(24px, 3.2vh, 38px) clamp(20px, 2.4vw, 30px)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 'clamp(14px, 1.8vh, 22px)',
                      paddingBottom: 'clamp(14px, 1.8vh, 22px)',
                      borderBottom: '1px solid var(--hair)',
                    }}
                  >
                    {item.icon === 'play' && (
                      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.7 }}>
                        <path d="M5 3l12 7-12 7V3z" stroke="var(--fg)" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    )}
                    {item.icon === 'trend' && (
                      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.7 }}>
                        <path d="M2 14l5-5 4 4 7-8" stroke="var(--fg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 5h5v5" stroke="var(--fg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {item.icon === 'layers' && (
                      <svg width="28" height="28" viewBox="0 0 20 20" fill="none" style={{ opacity: 0.7 }}>
                        <rect x="2" y="2" width="16" height="6" stroke="var(--fg)" strokeWidth="1.3" />
                        <rect x="2" y="12" width="16" height="6" stroke="var(--fg)" strokeWidth="1.3" />
                      </svg>
                    )}
                    <span style={{ color: 'var(--fg-faint)', fontSize: 'clamp(12px, 1.15vw, 14px)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      {item.time}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 600, margin: '0 0 8px' }}>
                    {item.title}
                  </h3>
                  <p style={{ color: 'var(--fg-muted)', fontSize: 'clamp(14px, 1.3vw, 17px)', lineHeight: 1.5, margin: 0 }}>
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Slide>

      {/* 9. Revenue — punchline */}
      <Slide center nav="Revenue" notes="We charge no one. MEV capture.">
        <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 8 }}>
          Revenue
        </h2>
        <p className="lead" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(24px, 4vh, 40px)', maxWidth: '100%', whiteSpace: 'nowrap', fontSize: 'clamp(14px, 1.5vw, 20px)' }}>
          Users pay zero for privacy.
        </p>
        <div style={{ display: 'flex', gap: '1px', maxWidth: 640, marginInline: 'auto', background: 'var(--hair)' }}>
          {/* Stripe column */}
          <div style={{ flex: 1, background: 'var(--bg)', padding: 'clamp(22px, 2.8vh, 34px) clamp(20px, 2.4vw, 30px)', textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-faint)', marginBottom: 20 }}>
              Stripe
            </div>
            <div style={{ width: 48, height: 48, margin: '0 auto 14px', border: '2px solid var(--fg-faint)', display: 'grid', placeItems: 'center' }}>
              <img src="/protocols/stripe.jpg" alt="Stripe" style={{ width: 28, height: 28, opacity: 0.5, objectFit: 'cover' }} />
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 'clamp(15px, 1.5vw, 18px)', lineHeight: 1.7 }}>
              Merchant pays
              <br />
              <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 'clamp(26px, 3vw, 36px)' }}>+3%</span>
              <br />
              per transaction
            </div>
          </div>
          {/* Erebuz column */}
          <div style={{ flex: 1, background: 'var(--surface)', padding: 'clamp(22px, 2.8vh, 34px) clamp(20px, 2.4vw, 30px)', textAlign: 'center' }}>
            <div style={{ fontSize: 'clamp(12px, 1.2vw, 15px)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg)', marginBottom: 20 }}>
              Erebuz
            </div>
            <div style={{ width: 48, height: 48, margin: '0 auto 14px', border: '2px solid var(--fg)', display: 'grid', placeItems: 'center' }}>
              <img src="/erebuz-logo.svg" alt="Erebuz" style={{ width: 28, height: 28 }} />
            </div>
            <div style={{ color: 'var(--fg-muted)', fontSize: 'clamp(15px, 1.5vw, 18px)', lineHeight: 1.7 }}>
              User pays
              <br />
              <span style={{ color: 'var(--fg)', fontWeight: 600, fontSize: 'clamp(26px, 3vw, 36px)' }}>$0</span>
              <br />
              for our services
            </div>
          </div>
        </div>
        <p style={{ marginTop: 'clamp(14px, 2vh, 24px)', fontSize: 'clamp(14px, 1.5vw, 20px)', color: 'var(--fg-muted)', maxWidth: 480, marginInline: 'auto' }}>
          We make money on the route through MEV opportunity.
        </p>
      </Slide>

      {/* 10. Team */}
      <Slide center nav="Team" notes="Two builders. Product + Engineer.">
        <Reveal>
          <h2 className="headline" style={{ textAlign: 'center', marginInline: 'auto', marginBottom: 'clamp(20px, 3vh, 32px)' }}>
            Team
          </h2>
        </Reveal>
        <Team
          people={[
            { name: '0xabhii', role: 'Product', img: '/x-pfp.jpg', href: 'https://x.com/0xabhii' },
            { name: '0xswayam', role: 'Engineer', img: '/swayam-pfp.jpg', href: 'https://x.com/devswayam' },
          ]}
        />
      </Slide>

      {/* 11. Close */}
      <Slide center nav="Close" notes="Ask for the introduction. Leave the URL on screen.">
        <Reveal>
          <img
            src="/erebuz-logo.svg"
            alt="Erebuz"
            style={{ width: 48, height: 48, marginBottom: 24, filter: 'brightness(0) invert(0.96)' }}
          />
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="display" style={{ fontSize: 'clamp(44px, 8vw, 108px)' }}>
            Thank You.
          </h2>
        </Reveal>
      </Slide>
    </Deck>
  );
}
