"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { FullScreenLoader } from "@/components/full-screen-loader";
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

  if (!hydrated || !authed) return <FullScreenLoader />;

  return <AppShell>{children}</AppShell>;
}
