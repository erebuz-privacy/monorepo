"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

/** App-wide Lenis smooth scroll (the Olivier Larose staple). */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.2, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}
