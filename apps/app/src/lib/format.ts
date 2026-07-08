export function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a token amount with a sensible number of decimals. */
export function formatAmount(value: number, symbol?: string): string {
  const decimals = value !== 0 && Math.abs(value) < 1 ? 6 : 2;
  const n = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
  return symbol ? `${n} ${symbol}` : n;
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address.startsWith("0x") || address.length < 2 + chars * 2) {
    return address;
  }
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
