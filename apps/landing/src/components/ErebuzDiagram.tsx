"use client"

import { useEffect, useRef, useState } from "react"

type Logo = { name: string; src: string }

const privacy: Logo[] = [
  { name: "StarkNet", src: "/protocols/starknet.png" },
  { name: "Railgun", src: "/protocols/railgun.jpg" },
  { name: "Zcash", src: "/protocols/zcash.jpg" },
  { name: "Monero", src: "/protocols/monero.jpg" },
]

const compliance: Logo[] = [
  { name: "Chainalysis", src: "/protocols/chainalaysis.png" },
  { name: "Elliptic", src: "/protocols/Elliptic.jpg" },
  { name: "TRM Labs", src: "/protocols/TRM.jpg" },
]

const defi: Logo[] = [
  { name: "Stargate", src: "/protocols/stargate.png" },
  { name: "Across", src: "/protocols/across.jpg" },
  { name: "Relay", src: "/protocols/relay.jpg" },
  { name: "deBridge", src: "/protocols/debridge.jpg" },
]

/* ----------------------------------------------------------------------- */

function Chip({ logo, active, delay }: { logo: Logo; active: boolean; delay: number }) {
  return (
    <div className="flex w-14 flex-col items-center gap-1.5">
      <div
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-white transition-colors duration-500"
        style={{
          borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.1)",
          animation: active ? `erebuz-rise 0.5s ease-out ${delay}ms both` : undefined,
          opacity: active ? 1 : 0.18,
        }}
      >
        <img src={logo.src} alt={logo.name} className="size-full object-contain" />
      </div>
      <span
        className="text-center text-[9px] leading-tight text-white/70 transition-opacity duration-500"
        style={{ opacity: active ? 1 : 0.18 }}
      >
        {logo.name}
      </span>
    </div>
  )
}

function OutputSection({
  title,
  logos,
  active,
}: {
  title: string
  logos: Logo[]
  active: boolean
}) {
  return (
    <div
      className="flex h-full flex-col justify-center rounded-2xl border px-4 py-3 transition-all duration-500"
      style={{
        borderColor: active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)",
        backgroundColor: active ? "rgba(255,255,255,0.04)" : "transparent",
      }}
    >
      <span
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors duration-500"
        style={{ color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}
      >
        {title}
      </span>
      <div className="flex flex-row gap-1.5">
        {logos.map((l, i) => (
          <Chip key={l.name} logo={l} active={active} delay={i * 90} />
        ))}
      </div>
    </div>
  )
}

function PhoneNode({ active }: { active: boolean }) {
  return (
    <div
      className="absolute flex flex-col items-center justify-between rounded-[20px] border-2 bg-white py-3 transition-all duration-500"
      style={{
        left: 44,
        top: 120,
        width: 92,
        height: 124,
        borderColor: active ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.12)",
        opacity: active ? 1 : 0.3,
      }}
    >
      <span className="h-1 w-8 rounded-full bg-[#080808]/25" aria-hidden="true" />
      <span className="text-base font-bold tracking-tight text-[#080808]">App</span>
      <span className="h-1 w-10 rounded-full bg-[#080808]/25" aria-hidden="true" />
    </div>
  )
}

function WalletNode({ active }: { active: boolean }) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-lg border-2 bg-white transition-all duration-500"
      style={{
        left: 30,
        top: 330,
        width: 130,
        height: 96,
        borderColor: active ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.12)",
        opacity: active ? 1 : 0.3,
      }}
    >
      <span
        className="absolute inset-x-0 top-6 border-t-2 border-[#080808]/15"
        aria-hidden="true"
      />
      <span
        className="absolute right-3 top-[18px] h-3 w-3 rounded-full border-2 border-[#080808]/40 bg-white"
        aria-hidden="true"
      />
      <span className="mt-6 text-base font-bold tracking-tight text-[#080808]">Wallet</span>
    </div>
  )
}

function ArrowLabel({
  text,
  x,
  y,
  active,
}: {
  text: string
  x: number
  y: number
  active: boolean
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium text-white transition-opacity duration-500"
      style={{ left: x, top: y, opacity: active ? 1 : 0.25, backgroundColor: "#080808" }}
    >
      {text}
    </div>
  )
}

function Connector({ d, active }: { d: string; active: boolean }) {
  const ref = useRef<SVGPathElement>(null)
  const [len, setLen] = useState(600)

  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength())
  }, [d])

  return (
    <>
      <path
        ref={ref}
        d={d}
        markerEnd="url(#arrow)"
        style={{
          stroke: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.14)",
          strokeDasharray: len,
          strokeDashoffset: active ? 0 : len,
          transition: "stroke-dashoffset 0.7s ease-out, stroke 0.5s ease-out",
        }}
      />
      {active && (
        <circle r="3.5" fill="#ffffff">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </>
  )
}

/* ----------------------------------------------------------------------- */

const MERGE_1 = "M 136 182 C 250 182, 270 280, 358 280"
const MERGE_2 = "M 160 378 C 250 378, 270 280, 358 280"
const BRANCH_P = "M 542 280 C 600 280, 600 95, 638 95"
const BRANCH_C = "M 542 280 L 638 280"
const BRANCH_D = "M 542 280 C 600 280, 600 465, 638 465"
const SETTLE_P = "M 920 95 C 993 95, 978 280, 1124 280"
const SETTLE_C = "M 920 280 L 1124 280"
const SETTLE_D = "M 920 465 C 993 465, 978 280, 1124 280"

export function ErebuzDiagram() {
  const W = 1296
  const H = 560
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const ratio = containerRef.current.clientWidth / W
        setScale(Math.min(1, Math.max(0.55, ratio)))
      }
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    if (containerRef.current) observer.observe(containerRef.current)
    window.addEventListener("resize", updateScale)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateScale)
    }
  }, [W])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || scale >= 1) return
    const isMobile = window.matchMedia("(max-width: 767px)").matches
    if (!isMobile) return
    let id: number
    let dir = 1
    let paused = false
    let pauseTimeout: ReturnType<typeof setTimeout>
    const step = 0.6
    const scroll = () => {
      if (!paused) {
        el.scrollLeft += step * dir
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) dir = -1
        if (el.scrollLeft <= 0) dir = 1
      }
      id = requestAnimationFrame(scroll)
    }
    const pause = () => {
      paused = true
      clearTimeout(pauseTimeout)
      pauseTimeout = setTimeout(() => { paused = false }, 3000)
    }
    el.addEventListener("touchstart", pause, { passive: true })
    el.addEventListener("mousedown", pause)
    id = requestAnimationFrame(scroll)
    return () => {
      cancelAnimationFrame(id)
      el.removeEventListener("touchstart", pause)
      el.removeEventListener("mousedown", pause)
      clearTimeout(pauseTimeout)
    }
  }, [scale])

  const [progress, setProgress] = useState(1)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) return
    let id: number
    const duration = 8000
    const start = Date.now()
    const animate = () => {
      const elapsed = (Date.now() - start) % duration
      setProgress(elapsed / duration)
      id = requestAnimationFrame(animate)
    }
    id = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(id)
  }, [])

  const inputsActive = true
  const mergeActive = true
  const sdkActive = progress >= 0.03
  const privacyActive = progress >= 0.12
  const complianceActive = progress >= 0.21
  const defiActive = progress >= 0.30
  const settleActive = progress >= 0.39

  return (
    <div className="w-full" ref={containerRef}>
      <div className="w-full overflow-x-auto md:overflow-hidden scroll-smooth" ref={scrollRef}>
        <div className="relative ml-0" style={{ width: W, height: H, zoom: `${(scale * 100).toFixed(0)}%` }}>
          <svg
            className="absolute inset-0"
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>

            <g strokeWidth="1.5" className="text-white">
              <Connector d={MERGE_1} active={mergeActive} />
              <Connector d={MERGE_2} active={mergeActive} />
              <Connector d={BRANCH_P} active={privacyActive} />
              <Connector d={BRANCH_C} active={complianceActive} />
              <Connector d={BRANCH_D} active={defiActive} />
              <Connector d={SETTLE_P} active={settleActive} />
              <Connector d={SETTLE_C} active={settleActive} />
              <Connector d={SETTLE_D} active={settleActive} />
            </g>
          </svg>

          <PhoneNode active={inputsActive} />
          <WalletNode active={inputsActive} />

          <div
            className="absolute flex flex-col items-center justify-center gap-1 rounded-2xl border bg-white transition-all duration-500"
            style={{
              left: 360,
              top: 230,
              width: 182,
              height: 100,
              borderColor: sdkActive ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.1)",
              opacity: sdkActive ? 1 : 0.4,
            }}
          >
            {sdkActive && (
              <span
                className="pointer-events-none absolute inset-0 rounded-2xl border border-white"
                style={{ animation: "erebuz-pulse 2s ease-out infinite" }}
                aria-hidden="true"
              />
            )}
            <img src="/images/erebuz-logo.svg" alt="Erebuz" className="h-7 w-auto brightness-0" />
            <span className="text-sm font-bold tracking-tight text-[#080808]">Erebuz SDK</span>
          </div>
          {/* <ArrowLabel text="Routing fee" x={451} y={352} active={sdkActive} /> */}

          <ArrowLabel text="findRoute()" x={246} y={224} active={mergeActive} />
          <ArrowLabel text="findRoute()" x={246} y={336} active={mergeActive} />

          <ArrowLabel text="Privacy" x={592} y={168} active={privacyActive} />
          <ArrowLabel text="Compliance" x={592} y={264} active={complianceActive} />
          <ArrowLabel text="DeFi / Bridges" x={596} y={392} active={defiActive} />

          <ArrowLabel text="settle()" x={1022} y={250} active={settleActive} />

          <div className="absolute" style={{ left: 632, top: 36, width: 280, height: 100 }}>
            <OutputSection title="Privacy" logos={privacy} active={privacyActive} />
          </div>
          <div className="absolute" style={{ left: 632, top: 230, width: 280, height: 100 }}>
            <OutputSection title="Compliance" logos={compliance} active={complianceActive} />
          </div>
          <div className="absolute" style={{ left: 632, top: 424, width: 280, height: 100 }}>
            <OutputSection title="DeFi / Bridges" logos={defi} active={defiActive} />
          </div>

          <div
            className="absolute flex flex-col items-center justify-center gap-2 rounded-2xl border bg-white transition-all duration-500"
            style={{
              left: 1126,
              top: 218,
              width: 168,
              height: 124,
              borderColor: settleActive ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.1)",
              opacity: settleActive ? 1 : 0.4,
            }}
          >
            {settleActive && (
              <span
                className="pointer-events-none absolute inset-0 rounded-2xl border border-white"
                style={{ animation: "erebuz-pulse 2s ease-out infinite" }}
                aria-hidden="true"
              />
            )}
            <div className="flex items-end gap-1" aria-hidden="true">
              <span className="h-3 w-3 rounded-[3px] border border-[#080808]" />
              <span className="h-4 w-3 rounded-[3px] border border-[#080808]" />
              <span className="h-5 w-3 rounded-[3px] bg-[#080808]" />
              <span className="h-4 w-3 rounded-[3px] border border-[#080808]" />
              <span className="h-3 w-3 rounded-[3px] border border-[#080808]" />
            </div>
            <span className="text-base font-bold tracking-tight text-[#080808]">Blockchain</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#080808]/60">
              Settled
            </span>
          </div>
        </div>
      </div>

      {/* <div className="mx-auto mt-6 max-w-2xl">
        <p className="text-center text-sm font-medium text-white/60 sm:text-base">
          One SDK call. Private, compliant, multi-chain settlement.
        </p>
      </div> */}
    </div>
  )
}
