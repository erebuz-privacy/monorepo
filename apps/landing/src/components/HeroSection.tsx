"use client";

import { useRef, useState, useEffect } from "react";

const CHARS = "!<>-_\\/[]{}-=+*^?#$%&@#$%&ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const TEXT_LINE1 = "YOUR PRIVACY ROUTER";
const TEXT_LINE2 = "FOR EVERY CHAIN";
const CURSOR_RADIUS = 180;

function scrambleChar(i: number, tick: number): string {
  const idx = ((i * 13 + tick * 7) >>> 0) % CHARS.length;
  return CHARS[idx];
}

function partialDecrypt(text: string, progress: number, tick: number): string {
  if (progress >= 1) return text;
  return text.split("").map((c, i) => {
    if (c === " ") return " ";
    const threshold = ((i * 31 + 17) % 97) / 97;
    if (progress > threshold) return c;
    return scrambleChar(i, tick);
  }).join("");
}

function FloatingShapes() {
  const shapes = [
    { size: 60, x: "15%", y: "20%", duration: 18, delay: 0 },
    { size: 40, x: "75%", y: "15%", duration: 22, delay: 2 },
    { size: 30, x: "85%", y: "70%", duration: 16, delay: 1 },
    { size: 50, x: "25%", y: "80%", duration: 20, delay: 3 },
    { size: 35, x: "60%", y: "60%", duration: 14, delay: 0.5 },
    { size: 45, x: "10%", y: "55%", duration: 19, delay: 4 },
    { size: 25, x: "90%", y: "40%", duration: 17, delay: 1.5 },
    { size: 55, x: "45%", y: "85%", duration: 21, delay: 2.5 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {shapes.map((s, i) => (
        <div
          key={i}
          className="absolute border border-yellow/20 rounded-sm"
          style={{
            width: s.size,
            height: s.size,
            left: s.x,
            top: s.y,
            animation: `float-shape ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        />
      ))}
      {shapes.slice(0, 6).map((s, i) => (
        <div
          key={`dot-${i}`}
          className="absolute bg-yellow/10 rounded-full"
          style={{
            width: 4,
            height: 4,
            left: `calc(${s.x} + ${s.size / 2}px)`,
            top: `calc(${s.y} + ${s.size / 2}px)`,
            animation: `pulse-dot ${s.duration / 2}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollCircleRef = useRef<SVGCircleElement>(null);
  const cursorCircleRef = useRef<SVGCircleElement>(null);
  const [cursor, setCursor] = useState({ x: -999, y: -999 });
  const [jitterTick, setJitterTick] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);

  const displayText1 = revealed
    ? TEXT_LINE1
    : partialDecrypt(TEXT_LINE1, 0, jitterTick);
  const displayText2 = revealed
    ? TEXT_LINE2
    : partialDecrypt(TEXT_LINE2, 0, jitterTick);

  useEffect(() => {
    const scrollCircle = scrollCircleRef.current;
    const cursorCircle = cursorCircleRef.current;

    const onMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      setCursor({ x, y });
      if (cursorCircle) {
        cursorCircle.setAttribute("cx", String(x));
        cursorCircle.setAttribute("cy", String(y));
      }
    };

    const onMouseLeave = () => {
      setCursor({ x: -999, y: -999 });
      if (cursorCircle) {
        cursorCircle.setAttribute("cx", "-999");
        cursorCircle.setAttribute("cy", "-999");
      }
    };

    const onScroll = () => {
      const vh = window.innerHeight;
      const progress = Math.min(1, window.scrollY / vh);
      const diagonal = Math.hypot(window.innerWidth, window.innerHeight) / 2;
      const r = progress * diagonal;
      if (scrollCircle) scrollCircle.setAttribute("r", String(r));

      if (revealedRef.current) return;
      revealedRef.current = true;
      setRevealed(true);
      clearInterval(jitter);
      window.scrollTo({ top: vh, behavior: "smooth" });
    };

    const jitter = setInterval(() => {
      setJitterTick((t) => t + 1);
    }, 120);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    return () => {
      clearInterval(jitter);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative z-20 h-[200vh] bg-black">
      <div className="sticky top-0 flex items-center justify-center h-screen overflow-hidden">
        {/* Inline SVG mask - union of both circles (same coords as masked element) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <defs>
            <mask id="hero-reveal-mask">
              <rect width="100%" height="100%" fill="black" />
              <circle ref={scrollCircleRef} cx="50%" cy="50%" r="0" fill="white" />
              <circle ref={cursorCircleRef} cx="-999" cy="-999" r={CURSOR_RADIUS} fill="white" />
            </mask>
          </defs>
        </svg>
        <FloatingShapes />

        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Base layer: white text on black */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <h1
            className="text-center uppercase font-normal leading-[1em] tracking-wide text-white"
            style={{ fontSize: "clamp(2rem, 8.25vw, 100px)" }}
          >
            <div>{displayText1}</div>
            <div>{displayText2}</div>
          </h1>
        </div>

        {/* Revealed layer: yellow bg + black text, shown through SVG mask */}
        <div
          className="absolute inset-0 flex items-center justify-center bg-yellow pointer-events-none"
          style={{
            WebkitMaskImage: "url(#hero-reveal-mask)",
            maskImage: "url(#hero-reveal-mask)",
          }}
        >
          <h1
            className="text-center uppercase font-normal leading-[1em] tracking-wide text-black"
            style={{ fontSize: "clamp(2rem, 8.25vw, 100px)" }}
          >
            <div>{TEXT_LINE1}</div>
            <div>{TEXT_LINE2}</div>
          </h1>
        </div>

        {/* Scroll indicator */}
        <aside
          className="fixed bottom-0 left-0 right-0 flex justify-center pb-8 z-50 uppercase gap-5 pointer-events-none"
          style={{ opacity: cursor.x === -999 ? 0.8 : 0.15 }}
        >
          <span className="text-xs tracking-widest text-white/90">
            SCROLL TO EXPLORE
          </span>
        </aside>
      </div>
    </section>
  );
}
