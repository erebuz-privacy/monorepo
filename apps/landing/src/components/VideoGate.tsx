"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const WEBM = "/diagrams/routing-flow.webm";
const MP4 = "/diagrams/routing-flow.mp4";

const VideoGateCtx = createContext<{ src: string | null; active: boolean }>({
  src: null,
  active: false,
});
export const useGatedVideo = () => useContext(VideoGateCtx);

const LOGO_MASK = {
  maskImage: "url(/images/erebuz-logo.svg)",
  WebkitMaskImage: "url(/images/erebuz-logo.svg)",
  maskSize: "contain",
  WebkitMaskSize: "contain",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
} as const;

export function VideoGate({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [gone, setGone] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const pickUrl = () => {
      const v = document.createElement("video");
      const canWebm = v.canPlayType('video/webm; codecs="vp8, vp9"');
      return canWebm ? WEBM : MP4;
    };

    const done = (finalSrc: string) => {
      if (cancelled) return;
      setSrc(finalSrc);
      setProgress(1);
      setReady(true);
    };

    (async () => {
      const url = pickUrl();
      try {
        const res = await fetch(url);
        const total = Number(res.headers.get("Content-Length")) || 0;
        if (!res.body || !total) {
          done(url); // can't measure; just reveal and let <video> load it
          return;
        }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done: finished, value } = await reader.read();
          if (finished) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (!cancelled) setProgress(Math.min(0.999, received / total));
          }
        }
        objectUrl = URL.createObjectURL(
          new Blob(chunks as BlobPart[], {
            type: url.endsWith(".webm") ? "video/webm" : "video/mp4",
          }),
        );
        done(objectUrl);
      } catch {
        done(url); // network hiccup: reveal anyway, <video> falls back
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  // lock scroll while the overlay is up, then unmount it after the fade
  useEffect(() => {
    const root = document.documentElement;
    if (!ready) {
      root.style.overflow = "hidden";
      return;
    }
    root.style.overflow = "";
    const t = window.setTimeout(() => setGone(true), 650);
    return () => window.clearTimeout(t);
  }, [ready]);

  const pct = Math.round(progress * 100);

  return (
    <VideoGateCtx.Provider value={{ src, active: true }}>
      {children}
      {!gone && (
        <div
          className={cn(
            "fixed inset-0 z-100 flex flex-col items-center justify-center bg-[#0b0b0a] transition-opacity duration-500",
            ready ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          <span className="block size-7 bg-white" style={LOGO_MASK} />
          <div className="mt-8 h-px w-56 overflow-hidden bg-white/10">
            <div
              className="h-full bg-white transition-[width] duration-150 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="mt-4 text-xs tabular-nums text-neutral-500">
            {pct}%
          </span>
        </div>
      )}
    </VideoGateCtx.Provider>
  );
}
