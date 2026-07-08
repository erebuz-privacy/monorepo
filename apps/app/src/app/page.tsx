"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useApp } from "@/lib/store";

export default function Index() {
  const router = useRouter();
  const { hydrated, authed } = useApp();

  useEffect(() => {
    if (!hydrated) return;
    if (!authed) router.replace("/welcome");
    else router.replace("/send");
  }, [hydrated, authed, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
