"use client";

import { useEffect, useRef } from "react";

/** Halftone dot-matrix "mountain" (Railgun-style data-viz), monochrome on dark. */
export function DotMountain({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext("2d");
    if (!x) return;
    let raf = 0;

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (!W || !H) return;
      c.width = W * dpr;
      c.height = H * dpr;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.scale(dpr, dpr);
      x.clearRect(0, 0, W, H);

      const step = 13;
      const r = 1.5;
      const sky = (px: number) => {
        const nx = px / W;
        const h =
          0.3 +
          0.2 * Math.sin(nx * 6 + 0.4) +
          0.12 * Math.sin(nx * 15 + 1.6) +
          0.07 * Math.sin(nx * 29 + 2.7) +
          0.045 * Math.sin(nx * 54 + 0.9);
        return Math.max(0.06, Math.min(0.9, h));
      };

      for (let gx = step / 2; gx < W; gx += step) {
        const hy = sky(gx) * H;
        for (let gy = step / 2; gy < hy; gy += step) {
          const yPix = H - gy;
          const depth = gy / hy;
          const crest = gy < step * 1.5;
          if (crest) {
            x.fillStyle = "rgba(243,242,237,0.7)";
            x.beginPath();
            x.arc(gx, yPix, 1.8, 0, 7);
            x.fill();
          } else {
            // light, even, no heavy dark base row
            const op = 0.08 + depth * 0.17;
            x.fillStyle = `rgba(232,230,222,${op})`;
            x.beginPath();
            x.arc(gx, yPix, r, 0, 7);
            x.fill();
          }
        }
      }
    };

    draw();
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
