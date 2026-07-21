"use client";

// Camera QR scanner for the recipient address. Opens a fullscreen overlay,
// reads a wallet-address QR, and returns the raw value (the caller normalizes it).

import dynamic from "next/dynamic";
import { X } from "lucide-react";

// Camera-only lib — load client-side to keep it out of SSR.
const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), {
  ssr: false,
});

export function QrScanDialog({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (value: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-neutral-950 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="text-base font-semibold text-white">Scan address QR</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-white/5 text-white/50 hover:text-white"
            aria-label="Close scanner"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="relative aspect-square w-full bg-black">
          <Scanner
            onScan={(codes) => {
              const raw = codes[0]?.rawValue;
              if (raw) {
                onResult(raw);
                onClose();
              }
            }}
            onError={() => {
              /* camera permission denied / no device — user can close and paste */
            }}
            components={{ finder: true }}
            styles={{ container: { width: "100%", height: "100%" }, video: { objectFit: "cover" } }}
          />
        </div>
        <p className="px-5 py-4 text-center text-xs text-white/45">
          Point your camera at a wallet-address QR code.
        </p>
      </div>
    </div>
  );
}

/** Pull a usable address out of a scanned QR value (handles EIP-681 `ethereum:` URIs). */
export function normalizeScannedAddress(raw: string): string {
  const value = raw.trim();
  // EVM address inside an `ethereum:0x..@chain?...` URI or a bare address.
  const evm = value.match(/0x[0-9a-fA-F]{40}/);
  if (evm) return evm[0];
  // Non-EVM (Solana/Tron/…): strip a leading `scheme:` prefix if present.
  const colon = value.indexOf(":");
  return colon > 0 && colon < 12 ? value.slice(colon + 1).split(/[?@]/)[0] : value;
}
