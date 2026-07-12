"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The custody-choice screen is superseded by the per-transfer method screen
// ("/method"). This route just forwards to the quote entry. The full original
// implementation is preserved below.
export default function Secure() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}

/* ===================== ORIGINAL "SECURE" SCREEN (kept for later) =====================
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";

import { cn } from "@erebuz/ui/lib/utils";

import { useApp, type Custody } from "@/lib/store";

const OPTIONS: {
  id: Custody;
  title: string;
  benefit: string;
  recommended?: boolean;
  icon: typeof ShieldCheck;
  detail: string;
}[] = [
  {
    id: "managed",
    title: "Managed",
    benefit: "Secured in a protected enclave",
    recommended: true,
    icon: ShieldCheck,
    detail:
      "Your keys live inside a Trusted Execution Environment (TEE) — a sealed box even we can't look inside. You don't pay gas and you can recover access with your Google login. Easiest to use.",
  },
  {
    id: "self",
    title: "Self-custody",
    benefit: "You hold the keys · full control",
    icon: KeyRound,
    detail:
      "An embedded wallet only you control. Maximum sovereignty — but you're responsible for your keys, and you may need to cover gas yourself.",
  },
];

export default function Secure() {
  const router = useRouter();
  const { hydrated, authed, custody, chooseCustody } = useApp();
  const [expanded, setExpanded] = useState<Custody | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!authed) router.replace("/welcome");
    else if (custody) router.replace("/home");
  }, [hydrated, authed, custody, router]);

  const pick = (id: Custody) => {
    chooseCustody(id);
    router.replace("/home");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose how your funds are secured
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You can change this later in Settings.
        </p>
      </div>

      <div className="space-y-4">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <div key={opt.id} className="space-y-2">
              <button
                type="button"
                onClick={() => pick(opt.id)}
                className={cn(
                  "group border-border hover:border-primary hover:bg-accent/40 w-full rounded-xl border p-4 text-left transition-all",
                  "active:scale-[0.99]"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{opt.title}</span>
                      {opt.recommended ? (
                        <span className="text-brand text-xs font-medium">
                          Recommended
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-1 block text-sm leading-relaxed">
                      {opt.benefit}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground group-hover:text-foreground size-5 shrink-0 self-center transition-colors" />
                </div>
              </button>

              <div className="pl-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((e) => (e === opt.id ? null : opt.id))
                  }
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {expanded === opt.id ? "Hide" : "What's this?"}
                </button>
                {expanded === opt.id ? (
                  <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                    {opt.detail}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
==================================================================================== */
