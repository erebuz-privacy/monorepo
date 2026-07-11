"use client";

import { useEffect, useRef, useState } from "react";
import { useScroll } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Pinned, scroll-scrubbed video. Two things make it smooth:
 *  1. the mp4 is re-encoded to all-keyframes (every frame seekable), so
 *     currentTime seeks are instant;
 *  2. currentTime is eased toward the scroll target inside a rAF loop rather
 *     than set directly on scroll events, so motion is buttery both ways.
 *
 * Cropping is two plain percentages of the video's height:
 *   cropTop={12}    -> trims 12% off the top
 *   cropBottom={8}  -> trims 8% off the bottom
 * (native clip is 1280x720; 0 / 0 shows the whole frame.)
 */
export function ScrollVideo({
  src,
  className,
  scroll = "220vh",
  cropTop = 0,
  cropBottom = 0,
}: {
  src: string;
  className?: string;
  scroll?: string;
  cropTop?: number;
  cropBottom?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const { scrollYProgress } = useScroll({
    target: wrap,
    offset: ["start start", "end end"],
  });

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    let raf = 0;
    let current = 0;

    const tick = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 0) {
        const target = Math.min(d - 0.05, Math.max(0, scrollYProgress.get() * d));
        // ease current -> target
        current += (target - current) * 0.12;
        if (Math.abs(target - current) < 0.004) current = target;
        // only seek when the frame would actually change
        if (Math.abs(v.currentTime - current) > 1 / 48) {
          v.currentTime = current;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scrollYProgress]);

  // two crop percentages -> a visible aspect ratio + object-position
  const ct = Math.max(0, cropTop) / 100;
  const cb = Math.max(0, cropBottom) / 100;
  const visible = Math.max(0.15, 1 - ct - cb);
  const aspect = `1280 / ${(720 * visible).toFixed(2)}`;
  const posY = ct + cb > 0 ? ((ct / (ct + cb)) * 100).toFixed(2) : "50";

  return (
    <div ref={wrap} className={cn("relative", className)} style={{ height: scroll }}>
      <div className="sticky top-0 flex h-svh items-center overflow-hidden">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
          <video
            ref={vid}
            muted
            playsInline
            preload="auto"
            aria-label="Erebuz routing flow"
            onLoadedData={() => setReady(true)}
            onCanPlay={() => setReady(true)}
            style={{ objectPosition: `center ${posY}%` }}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-700",
              ready ? "opacity-100" : "opacity-0",
            )}
          >
            {/* WebM has a real alpha channel (transparent bg); mp4 is the
                color-matched fallback for browsers without VP9 alpha. */}
            <source src={src.replace(/\.mp4$/, ".webm")} type="video/webm" />
            <source src={src} type="video/mp4" />
          </video>

          {/* Loader while the clip downloads. Pulsing squares echo the grid
              motif; sits on the transparent frame so the page shows through. */}
          {!ready && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4"
            >
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-2 animate-pulse bg-white/40"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs tracking-wide text-neutral-500">
                Loading routing flow
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
