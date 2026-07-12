"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { FullScreenLoader } from "@/components/full-screen-loader";

// The send/quote experience now lives at the public root ("/") as a live,
// TEE-backed swap+bridge quote. This route just forwards there.
export default function SendRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <FullScreenLoader className="min-h-[calc(100dvh-4rem)]" />;
}
