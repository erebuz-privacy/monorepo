# HeroSection Specification

## Overview
- **Target file:** `src/components/HeroSection.tsx`
- **Screenshot:** `docs/design-references/erebuz.net/section-hero-section.png`
- **Interaction model:** scroll-driven (GSAP ScrollTrigger pin + canvas animation)

## DOM Structure
```
section#interchain-privacy.relative.w-full.flex.items-end.h-screen.z-20
├── div.top-0.flex.w-full.h-screen.pointer-events-none
│   └── canvas (GSAP animated canvas - full screen background)
├── div.pin-spacer
│   └── div.interchain-privacy-container.absolute.flex.top-0.left-0.items-center.justify-center.w-full.h-full.z-10.overflow-hidden.lg:bg-yellow
│       ├── header (heading content)
│       │   └── h1 "Your Gateway to the Shielded Multichain"
│       └── ...
└── div.fixed.bottom-0.flex.justify-center.w-full.pb-8.z-50.uppercase
    └── "Scroll to Explore" + SVG icon
```

## Computed Styles

### section#interchain-privacy
- height: 100vh (900px)
- display: flex, align-items: flex-end
- padding: py-10 pt-36 (md:pt-0 md:pb-0)
- z-index: 20, position: relative

### Hero heading header
- position: relative, z-index: auto
- padding: py-12 (md:py-20)
- width: 100%, left: 0, top: 0
- container: xl:container

### "Your Gateway to the Shielded Multichain" text
- font-size: 80px (text-[80px])
- line-height: 1.2em
- text-transform: uppercase
- color: yellow (#FFFF00)
- font-weight: normal (400)

### "Scroll to Explore" indicator
- position: fixed, bottom: 0
- width: 100%, display: flex, justify-content: center
- padding-bottom: 2rem (pb-8)
- z-index: 50
- text-transform: uppercase

## States & Behaviors

### Scroll-driven pin
- The hero section is pinned via GSAP ScrollTrigger (pin-spacer div detected)
- Canvas animates as scroll progresses
- Content stays fixed while canvas animates

### Canvas animation
- Full-screen canvas element
- GSAP-powered animated graphics
- Transitions as user scrolls

## Assets
- No static images in hero (canvas is animated)

## Text Content
- "Your Gateway to the Shielded Multichain"
- "Scroll to Explore"

## Responsive Behavior
- **Desktop (1440px):** Full hero with canvas
- **Tablet (768px):** Reduced heading size
- **Mobile (390px):** Smaller text, adjusted padding
