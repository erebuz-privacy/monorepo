# Namada.net Page Topology

## Overall Layout
- **Background:** Black (#000)
- **Text:** Yellow (#FFFF00) for headings, varied for body
- **Font:** Space Grotesk (all text)
- **Scroll behavior:** GSAP ScrollTrigger (pin-spacer detected), canvas animation in hero

## Sections (top to bottom)

1. **Navbar** (fixed, z-50)
   - "Mainnet Live Shields Up!" scrolling ticker banner (40px, black bg, yellow text, border-bottom yellow)
   - Main nav: Logo + nav links (Discover, Composable Privacy Layer, Unified Shielded Set, etc.)
   - Transition: 0.7s cubic-bezier(0.19, 1, 0.22, 1) ease-out-expo

2. **Hero Section** (#interchain-privacy)
   - Full screen (h-screen, 900px), flex items-end
   - Canvas animation (full-screen canvas, GSAP-powered)
   - "Your Gateway to the Shielded Multichain" heading
   - "Scroll to Explore" fixed bottom indicator
   - z-index: 20

3. **A New Era heading** (section break)
   - Large text: "A New Era of Shielded Multichain Interactions"
   - Yellow text with text-border effects

4. **Composable Privacy Layer** (#composable-privacy-layer)
   - Icon + "COMPOSABLE PRIVACY LAYER" tag
   - Description paragraphs
   - "START SHIELDING" CTA button
   - Features list with checkmarks
   - Number icon (01-04 indicators)

5. **Unified Shielded Set** (#unified-shielded-set) — 01
   - Icon + "UNIFIED SHIELDED SET" title
   - Description + tagline
   - Asset icons (ATOM, NTRN, NYM, OSMO, TIA, etc.)

6. **Get Rewards** (#get-rewards) — 02
   - Icon + "GET REWARDS FOR SHIELDING YOUR ASSETS" title
   - Description + tagline

7. **Shielded Actions** (#shielded-actions) — 03
   - Icon + "SHIELDED ACTIONS FOR CROSS-CHAIN DEFI" title
   - Description + tagline

8. **IBC Interoperability** (#ibc-interoperability) — 04
   - Icon + "IBC INTEROPERABILITY" title
   - Description + tagline

9. **Use Namada** (#use-namada)
   - Three cards: "Shield Assets" (yellow bg), "Stake Nam" (cyan bg), "Govern" (black bg, yellow border)
   - Each with image, description, CTA button

10. **Get Involved** (#get-involved)
    - "GET INVOLVED" heading
    - "JOIN THE COMMUNITY" grid with X, Discord, Forum cards
    - "SHIELDED METRICS" card
    - "VISUAL IDENTITY" card
    - "DEVELOP AND OPERATE ON NAMADA" section with cards
    - "ECOSYSTEM" card

11. **Footer**
    - "NAMADA MAINNET IS HERE" heading
    - Navigation columns: Namada, Community, Developers, Learn
    - Social links
    - Copyright: "© 2026 Impressum"

## Interaction Models
- Navbar: Scroll-driven (bg changes at ~800px scroll)
- Hero: Scroll-driven (GSAP ScrollTrigger pin + canvas animation)
- Feature sections: Static (scroll into view)
- Use Namada cards: Hover effects (translate-y on stagger)
- Get Involved: Static with hover states
- Footer: Static with link hover states
