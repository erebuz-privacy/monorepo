# Navbar Specification

## Overview
- **Target file:** `src/components/Navbar.tsx`
- **Screenshot:** `docs/design-references/erebuz.net/section-navbar.png`
- **Interaction model:** scroll-driven (header changes at ~800px scroll)

## DOM Structure
```
nav.fixed.w-full.z-50.top-0.left-0
├── a (Mainnet Live banner - scrolls text)
│   └── div.overflow-hidden.w-full
│       └── animated ticker text
└── div.container (main nav bar)
    ├── a (Namada Logo)
    │   └── img (namada-black.gif)
    ├── div.hidden.md:flex (nav links)
    │   ├── links
    │   └── ...
    └── button (mobile menu toggle)
```

## Computed Styles

### nav.fixed
- position: fixed, z-index: 50, top: 0
- width: 100%, height: 140px
- background: transparent initially, changes on scroll
- transition: all 0.7s cubic-bezier(0.19, 1, 0.22, 1)
- font-family: "Space Grotesk", Helvetica, sans-serif

### Mainnet Banner (black bar with yellow text)
- background: black (#000)
- height: 40px
- border-bottom: 1px solid yellow (#FFFF00)
- color: yellow (#FFFF00)
- text-transform: uppercase
- white-space: nowrap, overflow: hidden
- hover: text-cyan (#00FFFF)
- transition: color 0.3s ease

### Nav links
- text-transform: uppercase
- font-size: 16px
- color: black (#000) on light bg, or varies by section
- hover: underline effect

### Logo
- width: 48.98px, height: 48.98px
- display: hidden on mobile (md:block)

## States & Behaviors

### Scroll-triggered background change
- **Trigger:** scroll position ~800px from top
- **State A (top):** background: transparent, no shadow
- **State B (scrolled):** background: black (#000) with yellow bottom border
- **Transition:** all 0.7s cubic-bezier(0.19, 1, 0.22, 1)
- **Implementation:** scroll listener, add class when scrollY > threshold

### Mobile menu (below 768px)
- Logo visible
- Nav links hidden, hamburger button shown
- On click: slide-down menu overlay

## Assets
- Logo image: `public/images/namada-black.2c62e553.gif` (600x156)
- Logo icon: `<ErebuzLogo /> from icons.tsx

## Text Content
- "MAINNET LIVE" "SHIELDS UP!" repeating ticker
- Nav links: Discover, Composable Privacy Layer, Unified Shielded Set, Get Rewards, Shielded Actions, IBC Interoperability, Staking, Governance, Get Started

## Responsive Behavior
- **Desktop (1440px):** Full nav with all links visible
- **Tablet (768px):** Reduced padding, maybe hide some links
- **Mobile (390px):** Hamburger menu, logo + toggle only
