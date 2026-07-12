"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// The send/quote experience now lives at the public root ("/") as a live,
// TEE-backed swap+bridge quote. This route just forwards there.
export default function SendRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
      <Loader2 className="text-muted-foreground size-6 animate-spin" />
    </div>
  );
}
