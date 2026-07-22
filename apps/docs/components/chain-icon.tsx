export function ChainIcon({
  name,
  chainId,
  src,
}: {
  name: string;
  chainId: number;
  src: string;
}) {
  return (
    <span
      className="group relative inline-flex size-12 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] p-1.5 transition-colors hover:border-foreground/25 hover:bg-foreground/[0.06] focus-visible:border-foreground/30 focus-visible:outline-none"
      tabIndex={0}
      aria-label={`${name}, chain ID ${chainId}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={36}
        height={36}
        className="size-9 rounded-lg object-cover"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-foreground/10 bg-background px-2.5 py-1.5 text-xs text-foreground shadow-lg group-hover:block group-focus-visible:block"
      >
        {name} · {chainId}
      </span>
    </span>
  );
}
