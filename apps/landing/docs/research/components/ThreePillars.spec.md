# ThreePillars Specification

## Overview
- **Target file:** `src/components/ThreePillars.tsx`
- **Screenshot:** `docs/design-references/erebuz.net/section-composable-privacy-layer.png`
- **Interaction model:** static (scrolls into view)

## DOM Structure
```
section.py-24.md:py-40.lg:py-55.text-yellow
├── span.bg-yellow.text-black.uppercase.px-2 (pill: "THREE PILLARS")
├── h2.uppercase (heading)
├── p (description)
└── div.grid.grid-cols-1.md:grid-cols-3
    ├── div.border.border-yellow\/30.p-6.rounded-xl
    │   ├── h3 (pillar name: "Privacy")
    │   └── ul (integration list)
    ├── div (pillar: "Compliance")
    └── div (pillar: "DeFi / Bridges")
```

## Computed Styles

### Container section
- color: rgb(255, 255, 0) — yellow text
- max-width: 1280px (max-w-7xl)
- background: transparent

### Pill indicator
- background: yellow (#FFFF00)
- display: inline-flex
- padding: 0 8px
- color: black

### Section heading h2
- font-size: clamp(2rem, 6vw, 56px)
- uppercase, font-normal
- color: yellow (#FFFF00)
- line-height: 1.1em

### Pillar cards
- border: 1px solid rgba(255, 255, 0, 0.3)
- border-radius: 12px (rounded-xl)
- padding: 24px (p-6)

## Assets
- Checkmark SVG (inline, not from icons.tsx)

## Text Content
- (pill) "THREE PILLARS"
- Heading: "PRIVACY ROUTING, COMPLIANCE, DEFI in ONE SDK"
- Description: "Erebuz does not lock you into one privacy mechanism..."
- Pillars with integration lists for Privacy, Compliance, DeFi / Bridges
