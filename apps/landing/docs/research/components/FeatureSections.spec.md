# Feature Sections Specification

Sections 01-04 follow the same pattern. Each is a section with a number, icon, title, description, and tagline.

## Overview
- **Target files:** 
  - `src/components/PrivacyModel.tsx` (01)
  - `src/components/ComparisonSection.tsx` (02)
  - `src/components/SdkExample.tsx` (03)
  - `src/components/SupportedChains.tsx` (04)
- **Screenshots:** `docs/design-references/erebuz.net/section-{name}.png`
- **Interaction model:** static

## Common Pattern (Each section)
```
section/article (with id)
├── div (content left)
│   ├── span (number "01", "02", etc.) — small text
│   ├── header (title)
│   ├── icon SVG (feature icon)
│   ├── p (description)
│   └── p (tagline - italic or accent)
└── div (content right / illustration)
    └── asset tokens / images
```

## Computed Styles (common)

### Section container
- display: flex (flex-col on mobile, xl:flex-row on desktop)
- color: yellow (#FFFF00) for text-yellow sections
- padding: pt-20 lg:py-24
- gap: responsive
- relative positioning

### Number indicator
- font-size: varies (large number ~60-80px)
- font-weight: bold
- color: yellow or cyan

### Title h2
- font-size: 36-48px (responsive)
- uppercase, font-normal
- color: yellow (#FFFF00)

### Description p
- font-size: 16-18px
- color: yellow (#FFFF00)
- max-width: 600px

### Tagline
- font-size: 14-16px
- italic or lighter weight
- margin-top: 16px

## Per-Section Content

### 01 — Privacy Model (#privacy-model)
- Number: 01
- Icon: `<ShieldIcon />`
- Title: "PRIVACY MODEL & TEE"
- Description: "Consolidate assets fragmented across different blockchains into a single shielded asset hub. Erebuz's unified shielded set is capable of supporting any asset, and enables shielded cross-chain interactions."
- Tagline: "One hub, multiple assets, with full control over what you share."
- Images: Asset token icons (ATOM, NTRN, NYM, OSMO, TIA, UM, USDC, stATOM, stOSMO, stTIA)

### 02 — Comparison Section (#pricing)
- Number: 02
- Icon: N/A
- Title: "WHY NOT BUILD IT YOURSELF"
- Description: "Building custom privacy costs millions and takes over a year. It creates a small isolated pool — making users easier to fingerprint, not harder. Custom ZK code has cost DeFi over $200M in exploits. Erebuz removes the custom crypto entirely."
- Tagline: N/A (uses comparison table instead)

### 03 — SDK Example (#sdk)
- Number: 03
- Icon: `<ShieldIcon />`
- Title: "ONE SDK CALL"
- Description: "One master seed generates every key on every chain. One balance call returns private balance across all chains. One send() call handles routing, privacy, compliance, and gas."
- Tagline: "No custom crypto. No complex ZK. Just a single SDK integration."

### 04 — Supported Chains
- Number: 04
- Icon: N/A
- Title: "SUPPORTED CHAINS"
- Description: "Erebuz routes private transactions across every major EVM chain and StarkNet. More chains added as the shared privacy pool grows."
- Tagline: N/A (uses chain pill list instead)

## Common CTA
Each section can have a "DISCOVER" or "LEARN MORE" link
- uppercase, text-sm, border-bottom effect on hover
- With arrow icon or underline animation
