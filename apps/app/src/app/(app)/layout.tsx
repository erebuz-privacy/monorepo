"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { useApp } from "@/lib/store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { hydrated, authed } = useApp();

  useEffect(() => {
    if (!hydrated) return;
    if (!authed) router.replace("/welcome");
  }, [hydrated, authed, router]);

  if (!hydrated || !authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
