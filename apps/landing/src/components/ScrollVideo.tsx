"use client";

import { useEffect, useRef } from "react";
import { useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import { useGatedVideo } from "./VideoGate";

/**
 * Pinned, scroll-scrubbed video. Two things make it smooth:
 *  1. the clip is re-encoded to all-keyframes (every frame seekable), so
 *     currentTime seeks are instant;
 *  2. currentTime is eased toward the scroll target inside a rAF loop rather
 *     than set directly on scroll events, so motion is buttery both ways.
 *
 * The bytes are pre-downloaded by VideoGate and handed here as a blob URL, so
 * the <video> is fully buffered before the section is ever reached. If the gate
 * isn't present (blob null) it falls back to streaming the static files.
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
  const gated = useGatedVideo();
  const { scrollYProgress } = useScroll({
    target: wrap,
    offset: ["start start", "end end"],
  });

  // when the gate hands over the downloaded blob, point the element at it
  useEffect(() => {
    const v = vid.current;
    if (v && gated.src) v.load();
  }, [gated.src]);

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
            {...(gated.src ? { src: gated.src } : {})}
            muted
            playsInline
            // While the gate is fetching, download nothing here (it already is).
            // Off the gate, stream the static files directly.
            preload={gated.active && !gated.src ? "none" : "auto"}
            aria-label="Erebuz routing flow"
            style={{ objectPosition: `center ${posY}%` }}
            className="h-full w-full object-cover"
          >
            {/* Fallback only when no gate is present. WebM carries a real alpha
                channel (transparent bg); mp4 is the Safari fallback. */}
            {!gated.active && (
              <>
                <source src={src.replace(/\.mp4$/, ".webm")} type="video/webm" />
                <source src={src} type="video/mp4" />
              </>
            )}
          </video>
        </div>
      </div>
    </div>
  );
}
