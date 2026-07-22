"use client";

// App-wide background poller. Any locally-recorded transfer that is still
// "pending" (has a live TEE routeId and a non-terminal stage) is polled every
// few seconds and its status merged back into the store — so Activity updates
// on its own even when the user has left the bridge screen. Mounted once, near
// the root, inside <AppProvider>. Renders nothing.

import { useEffect, useRef } from "react";

import { useApp } from "@/lib/store";
import { tee } from "@/lib/tee";
import type { Activity } from "@/lib/mock-data";

const TERMINAL = new Set(["COMPLETED", "FAILED"]);

export function TxTracker() {
  const { activity, upsertActivity } = useApp();

  // Latest activity, read inside the poll loop without making it an effect dep
  // (which would reset the interval on every status update).
  const activityRef = useRef<Activity[]>(activity);
  useEffect(() => {
    activityRef.current = activity;
  });
  const inFlight = useRef<Set<string>>(new Set());

  // Effect only re-runs when the SET of pending route ids changes, not on every
  // field update to those records.
  const pendingKey = activity
    .filter(
      (a) => a.status === "pending" && a.live?.routeId && !TERMINAL.has(a.live.stage ?? "")
    )
    .map((a) => a.live!.routeId!)
    .join(",");

  useEffect(() => {
    const ids = pendingKey ? pendingKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;

    const poll = () => {
      for (const rid of ids) {
        if (inFlight.current.has(rid)) continue;
        inFlight.current.add(rid);
        tee
          .getRoute(rid)
          .then((r) => {
            if (cancelled) return;
            const rec = activityRef.current.find((a) => a.live?.routeId === rid);
            if (!rec?.live) return;
            const stage = r.status;
            const status: Activity["status"] =
              stage === "COMPLETED" ? "confirmed" : stage === "FAILED" ? "failed" : "pending";
            if (rec.status === status && rec.live.stage === stage) return; // no change
            // Stamp the routing-start the first time the deposit is detected (stage
            // leaves AWAITING_DEPOSIT) so the elapsed timer excludes the wait to fund.
            const startedAt =
              rec.live.startedAt ?? (stage !== "AWAITING_DEPOSIT" ? Date.now() : undefined);
            upsertActivity({ ...rec, status, live: { ...rec.live, stage, startedAt } });
          })
          .catch(() => {
            /* transient — retry next tick */
          })
          .finally(() => inFlight.current.delete(rid));
      }
    };

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pendingKey, upsertActivity]);

  return null;
}
