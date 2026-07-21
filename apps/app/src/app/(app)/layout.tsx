"use client";

// Shell for all three pages (bridge, activity, settings): the top nav is always
// present. Auth is mocked (the store defaults to a signed-in user), so there's
// no gate — just wait for hydration to avoid a flash of pre-localStorage state.

import { AppShell } from "@/components/app-shell";
import { FullScreenLoader } from "@/components/full-screen-loader";
import { useApp } from "@/lib/store";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { hydrated } = useApp();

  if (!hydrated) return <FullScreenLoader />;

  return <AppShell>{children}</AppShell>;
}
