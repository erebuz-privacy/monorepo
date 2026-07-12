"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";

import { BrandHeader } from "@/components/brand-header";
import { OptionCard } from "@/components/option-card";
import { Screen } from "@/components/screen";
import { useApp, type Custody } from "@/lib/store";

export default function Welcome() {
  const router = useRouter();
  const { hydrated, authed, login } = useApp();

  useEffect(() => {
    if (hydrated && authed) router.replace("/");
  }, [hydrated, authed, router]);

  const start = (custody: Custody) => {
    // Mock sign-in. Real auth (Privy / Google) wires in here later.
    login({ name: "Alex Rivera", email: "alex@wall8.xyz" }, custody);
    router.push("/");
  };

  return (
    <Screen width="sm">
      <BrandHeader className="mb-8" />

      <h1 className="text-2xl font-semibold tracking-tight">Sign in or create an account</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        Choose how your funds are secured. Managed is the easiest, or bring your own keys.
      </p>

      <div className="mt-6 space-y-3">
        <OptionCard
          icon={ShieldCheck}
          title="Managed"
          badge="Recommended"
          description="Secured in a protected enclave. Gasless, recoverable, easiest."
          onClick={() => start("managed")}
        />
        <OptionCard
          icon={KeyRound}
          title="Self-custody"
          badge="Coming soon"
          badgeVariant="outline"
          description="You hold the keys, via Google (Privy)."
          disabled
        />
      </div>

      <p className="text-muted-foreground mt-8 text-center text-xs leading-relaxed">
        Private and compliant by design. We never see who you are or what you send.
      </p>
    </Screen>
  );
}
