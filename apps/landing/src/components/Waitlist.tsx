"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FORM_ID = "1FAIpQLSeyCfVILyiS-3IKPn1OKboKNF-xmMGcbSMW8XBlptzB58xJig";
const EMAIL_ENTRY = "entry.117664500";

const FORM_URL = FORM_ID
  ? `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`
  : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Opens the waitlist dialog. Style the trigger via className. */
export function WaitlistButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <WaitlistDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function WaitlistDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prev;
    };
  }, [onClose]);

  async function submit(formData: FormData) {
    if (status !== "idle") return;
    const raw = formData.get("email");
    const email = typeof raw === "string" ? raw.trim() : "";
    if (!email) {
      setError("Please enter your email.");
      return;
    }
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setStatus("sending");
    if (FORM_URL) {
      try {
        // no-cors: the response is opaque, so reaching this line is "sent".
        await fetch(FORM_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ [EMAIL_ENTRY]: email }),
        });
      } catch {
        // network hiccup; nothing actionable to show the user here
      }
    } else {
      console.warn("Waitlist: FORM_ID not configured, submission dropped.");
    }
    setStatus("done");
  }

  return (
    <div
      className="fixed inset-0 z-110 flex items-center justify-center px-6"
      role="dialog"
      aria-modal="true"
      aria-label="Join the waitlist"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md border border-white/15 bg-[#0b0b0a] p-8">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 text-neutral-500 transition-colors hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        {status === "done" ? (
          <div className="py-4 text-center">
            <p className="text-xl font-bold tracking-tight">
              You&apos;re on the list.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              We&apos;ll reach out as soon as SDK access opens up.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xl font-bold tracking-tight">Get early access</p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              Erebuz is launching soon. Leave your email and be first in line
              for the SDK.
            </p>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit(new FormData(e.currentTarget));
              }}
              className="mt-6 flex flex-col gap-3"
            >
              <input
                type="email"
                name="email"
                required
                autoFocus
                placeholder="you@company.com"
                aria-invalid={!!error}
                onChange={() => setError(null)}
                className={cn(
                  "w-full rounded-none border bg-transparent px-4 py-3.5 text-[15px] text-white placeholder:text-neutral-600 focus:outline-none",
                  error
                    ? "border-red-400/60 focus:border-red-400"
                    : "border-white/15 focus:border-white/40",
                )}
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={status === "sending"}
                className={cn(
                  "rounded-none bg-white px-6 py-3.5 text-[15px] font-semibold text-black transition-transform hover:scale-[1.01]",
                  status === "sending" && "opacity-60",
                )}
              >
                {status === "sending" ? "Joining…" : "Join the waitlist"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
