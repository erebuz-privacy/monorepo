"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";


import { ThemeToggle } from "@/components/theme-toggle";
import { useApp, type Custody } from "@/lib/store";

export default function Welcome() {
  const router = useRouter();
  const { hydrated, authed, login } = useApp();

  useEffect(() => {
    if (hydrated && authed) router.replace("/send");
  }, [hydrated, authed, router]);

  const start = (custody: Custody) => {
    // Mock sign-in — real auth (Privy / Google) wires in here later.
    login({ name: "Alex Rivera", email: "alex@wall8.xyz" }, custody);
    router.push("/send");
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        {/* brand */}
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-950">
            <Image
              src="/wall8-logo.svg"
              alt="wall8"
              width={18}
              height={18}
              priority
              unoptimized
            />
          </span>
          <span className="text-xl font-semibold tracking-tight">wall8</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in or create an account
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Choose how your funds are secured. Managed is the easiest, or bring
          your own keys.
        </p>

        {/* Managed — prominent */}
        <button
          type="button"
          onClick={() => start("managed")}
          className="group border-border bg-card hover:border-primary/60 hover:bg-accent/40 mt-6 w-full rounded-xl border p-4 text-left transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Managed</span>
                <span className="text-brand text-xs font-medium">Recommended</span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                Secured in a protected enclave. Gasless, recoverable, easiest.
              </p>
            </div>
          </div>
        </button>

        <div className="text-muted-foreground my-4 text-center text-xs uppercase tracking-wide">
          Or bring your own keys
        </div>

        {/* Self-custody */}
        <button
          type="button"
          onClick={() => start("self")}
          className="group border-border bg-card hover:border-primary/60 hover:bg-accent/40 w-full rounded-xl border p-4 text-left transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
              <KeyRound className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Self-custody</div>
              <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                You hold the keys, via Google (Privy).
              </p>
            </div>
          </div>
        </button>

        <p className="text-muted-foreground mt-8 text-center text-xs leading-relaxed">
          Private and compliant by design. We never see who you are or what you
          send.
        </p>
      </div>
    </div>
  );
}
