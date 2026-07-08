"use client";

import { useRef, useState, useEffect } from "react";

const TRACK_SECTIONS = [
  "features-heading",
  "privacy-model",
  "pricing",
  "sdk",
  "supported-chains",
];

export function ScrollLine() {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const first = document.getElementById(TRACK_SECTIONS[0]);
      const last = document.getElementById(TRACK_SECTIONS[TRACK_SECTIONS.length - 1]);
      const useCases = document.getElementById("use-cases");
      if (!first || !last) return;

      const start = first.offsetTop;
      const end = useCases
        ? useCases.offsetTop - window.innerHeight
        : last.offsetTop + last.offsetHeight;
      const scrollY = window.scrollY;
      if (end <= start) return;
      const p = Math.min(1, Math.max(0, (scrollY - start) / (end - start)));
      setProgress(p);
      const remaining = end - scrollY;
      if (containerRef.current) {
        if (p <= 0) {
          containerRef.current.style.opacity = "0";
        } else {
          const fadeDist = 300;
          const fadeEnd = 100;
          const op = Math.max(0, Math.min(1, (remaining - fadeEnd) / (fadeDist - fadeEnd)));
          containerRef.current.style.opacity = String(op);
        }
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={containerRef} className="fixed left-0 top-0 h-screen z-40 pointer-events-none flex flex-col justify-center pl-6 md:pl-10">
      <div className="relative w-px h-[70vh] bg-white/5">
        <div
          ref={lineRef}
          className="absolute top-0 left-0 w-full bg-yellow/60 transition-none"
          style={{ height: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
