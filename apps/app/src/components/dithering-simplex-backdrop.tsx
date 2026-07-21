"use client";

import { Dithering } from "@paper-design/shaders-react";
import { useTheme } from "next-themes";
import React, { type HTMLAttributes, useEffect, useState } from "react";

import { cn } from "@erebuz/ui/lib/utils";

const MemoizedDithering = React.memo(Dithering);

interface DitheringSimplexBackdropProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Optional pre-rendered loop. When provided, video replaces the live shader. */
  videoSrc?: string;
}

/** Cult UI Pro's simplex-dither backdrop, tuned to wall8's ink + mint palette. */
export const DitheringSimplexBackdrop = React.memo(
  function DitheringSimplexBackdrop({
    children,
    className,
    videoSrc,
    ...props
  }: DitheringSimplexBackdropProps) {
    const { resolvedTheme } = useTheme();
    const [canAnimate, setCanAnimate] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    const isLight = resolvedTheme === "light";

    useEffect(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const coarse = window.matchMedia("(pointer: coarse)");
      const nav = navigator as Navigator & { deviceMemory?: number };
      const capable =
        !reduced.matches &&
        !coarse.matches &&
        (navigator.hardwareConcurrency ?? 4) >= 8 &&
        (nav.deviceMemory ?? 8) >= 8;

      const sync = () => setCanAnimate(capable && !document.hidden);
      const idle = window.requestIdleCallback?.(sync, { timeout: 800 }) ??
        window.setTimeout(sync, 250);
      document.addEventListener("visibilitychange", sync);
      reduced.addEventListener("change", sync);

      return () => {
        if (typeof idle === "number") {
          window.cancelIdleCallback?.(idle);
          window.clearTimeout(idle);
        }
        document.removeEventListener("visibilitychange", sync);
        reduced.removeEventListener("change", sync);
      };
    }, []);

    const useVideo = Boolean(videoSrc && !videoFailed);

    return (
      <div
        className={cn(
          "bg-background relative isolate flex min-h-dvh flex-col overflow-hidden transition-colors duration-300",
          className,
        )}
        {...props}
      >
        {useVideo ? (
          <video
            aria-hidden
            autoPlay
            className="pointer-events-none absolute inset-0 -z-20 size-full object-cover"
            loop
            muted
            onError={() => setVideoFailed(true)}
            playsInline
            preload="metadata"
            src={videoSrc}
          />
        ) : canAnimate ? (
          <MemoizedDithering
            className="pointer-events-none absolute inset-0 -z-20"
            colorBack={isLight ? "#edf8f4" : "#07100e"}
            colorFront={isLight ? "#8bcdb8" : "#246b55"}
            height={360}
            maxPixelCount={260_000}
            minPixelRatio={0.5}
            shape="simplex"
            size={2.35}
            speed={0.12}
            style={{ width: "100%", height: "100%" }}
            type="4x4"
            width={640}
          />
        ) : (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-20 opacity-90 [background-size:5px_5px,100%_100%]"
            style={{
              backgroundColor: isLight ? "#edf8f4" : "#07100e",
              backgroundImage: isLight
                ? "radial-gradient(rgba(20,128,96,0.16) 0.8px,transparent 0.8px),radial-gradient(circle at 42% 35%,rgba(139,205,184,0.62),transparent 42%)"
                : "radial-gradient(rgba(52,211,153,0.22) 0.8px,transparent 0.8px),radial-gradient(circle at 42% 35%,rgba(36,107,85,0.7),transparent 42%)",
            }}
          />
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-colors duration-300"
          style={{
            background: isLight
              ? "radial-gradient(circle at 50% 42%, transparent 0%, rgba(237,248,244,0.12) 52%, rgba(221,241,234,0.56) 100%)"
              : "radial-gradient(circle at 50% 42%, transparent 0%, rgba(3,9,8,0.22) 52%, rgba(3,8,7,0.72) 100%)",
          }}
        />
        <div className="relative flex min-h-dvh flex-1 flex-col">{children}</div>
      </div>
    );
  },
);

DitheringSimplexBackdrop.displayName = "DitheringSimplexBackdrop";
