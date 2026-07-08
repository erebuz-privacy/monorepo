"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const CURSOR_RADIUS = 180;
const NAVBAR_HEIGHT = 64;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [cursorY, setCursorY] = useState(9999);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => setCursorY(e.clientY);
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  const circleOverlapsNavbar = cursorY < NAVBAR_HEIGHT + CURSOR_RADIUS;
  const overYellow = !scrolled && circleOverlapsNavbar;

  const fg = scrolled ? "text-yellow" : overYellow ? "text-black" : "text-white";

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-700",
        scrolled
          ? "bg-black border-b border-yellow"
          : "bg-transparent",
      )}
      style={{ transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)" }}
    >
      <div className="flex justify-between items-center w-full h-16 px-4 lg:px-8 max-w-7xl mx-auto">
        <Link href="/" className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={cn("size-9 shrink-0", fg)}
              style={{
                maskImage: "url(/images/erebuz-logo.svg)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                WebkitMaskImage: "url(/images/erebuz-logo.svg)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                backgroundColor: "currentColor",
              }}
            />
            <span
              className={cn("uppercase text-2xl font-bold tracking-widest transition-all duration-1000", fg)}
              style={{ transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)" }}
            >
              EREBUZ
            </span>
          </div>
        </Link>

        <span
          className={cn(
            "text-xs uppercase tracking-widest px-3 py-1.5 border rounded-full transition-all duration-1000",
            scrolled
              ? "text-yellow border-yellow"
              : overYellow
                ? "text-black border-black/40"
                : "text-white border-white/40",
          )}
        >
          Coming Soon
        </span>
      </div>
    </header>
  );
}
