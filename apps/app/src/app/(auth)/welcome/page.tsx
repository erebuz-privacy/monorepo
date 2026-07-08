"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";

import { Button } from "@erebuz/ui/components/button";

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
    <div className="flex min-h-dvh flex-col items-center justify-between px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-neutral-950">
          <Image
            src="/wall8-logo.svg"
            alt="wall8"
            width={38}
            height={38}
            priority
            unoptimized
          />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">wall8</h1>
        <p className="text-muted-foreground mt-3 max-w-xs text-balance text-lg leading-relaxed">
          Send money privately, across any chain.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Button
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => start("managed")}
        >
          Get started
          <ArrowRight className="size-5" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full text-base"
          onClick={() => start("self")}
        >
          <KeyRound className="size-5" />
          Use self-custody
        </Button>
        <p className="text-muted-foreground pt-1 text-center text-xs leading-relaxed">
          Private and compliant by design. We never see who you are or what you
          send.
        </p>
      </div>
    </div>
  );
}
