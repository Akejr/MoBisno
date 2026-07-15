---
name: Techno-Luxury System
colors:
  surface: '#121317'
  surface-dim: '#121317'
  surface-bright: '#38393d'
  surface-container-lowest: '#0d0e12'
  surface-container-low: '#1a1b1f'
  surface-container: '#1e1f23'
  surface-container-high: '#292a2e'
  surface-container-highest: '#343539'
  on-surface: '#e3e2e7'
  on-surface-variant: '#c4c7c7'
  inverse-surface: '#e3e2e7'
  inverse-on-surface: '#2f3034'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c8c6c5'
  primary: '#c8c6c5'
  on-primary: '#313030'
  primary-container: '#121212'
  on-primary-container: '#7e7d7d'
  inverse-primary: '#5f5e5e'
  secondary: '#b8c3ff'
  on-secondary: '#002388'
  secondary-container: '#0043eb'
  on-secondary-container: '#c6ceff'
  tertiary: '#c6c6c8'
  on-tertiary: '#2f3132'
  tertiary-container: '#101214'
  on-tertiary-container: '#7c7d7f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#dde1ff'
  secondary-fixed-dim: '#b8c3ff'
  on-secondary-fixed: '#001356'
  on-secondary-fixed-variant: '#0035be'
  tertiary-fixed: '#e2e2e4'
  tertiary-fixed-dim: '#c6c6c8'
  on-tertiary-fixed: '#1a1c1d'
  on-tertiary-fixed-variant: '#454749'
  background: '#121317'
  on-background: '#e3e2e7'
  surface-variant: '#343539'
typography:
  display-xl:
    fontFamily: Sora
    fontSize: 72px
    fontWeight: '700'
    lineHeight: 80px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Sora
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
  headline-md:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 32px
  margin-desktop: 64px
  margin-mobile: 20px
  asymmetric-offset: 120px
---

## Brand & Style

The design system is engineered to evoke a sense of exclusive innovation and high-end precision. It targets a discerning audience that values both technical performance and aesthetic sophistication. The brand personality is "Techno-Luxury"—a fusion of high-precision engineering and premium lifestyle aesthetics.

The visual style is a hybrid of **Minimalism** and **Glassmorphism**, leaning into a futuristic, "lab-grade" professional look. The interface should feel like a high-end physical device: cold to the touch, perfectly machined, and responsive. We utilize generous whitespace to allow product photography to breathe, creating an atmosphere of gallery-like curation rather than a traditional retail marketplace.

## Colors

The palette is anchored in a deep charcoal base to provide a cinematic, high-contrast environment. 

- **Primary (#121212):** Used for the core background and deep "inked" surfaces. It establishes the "Techno" foundation.
- **Secondary (#2E5BFF):** Electric Cobalt is the functional accent. It is used sparingly for primary actions, active states, and high-importance notifications to simulate glowing indicators on electronic hardware.
- **Tertiary (#F5F5F7):** Soft Silver-Grey is reserved for primary typography and highlights, providing a metallic, premium contrast against the dark base.
- **Neutral (#8E8E93):** Used for secondary text, borders, and inactive UI elements to maintain hierarchy without cluttering the visual field.

## Typography

This design system utilizes a high-contrast typographic scale to differentiate between editorial brand moments and functional technical data.

- **Headlines (Sora):** A wide, geometric sans-serif that feels expansive and futuristic. Used for product names and hero sections.
- **Body (Hanken Grotesk):** A sharp, contemporary sans-serif with excellent legibility at smaller scales. It balances the "Sora" display face with professional restraint.
- **Labels (Geist):** A technical, developer-friendly face used for specifications, small UI controls, and "meta" information. The increased letter spacing and uppercase styling for labels mimic technical markings on electronic hardware.

## Layout & Spacing

The layout philosophy rejects standard symmetry in favor of a sophisticated **Asymmetric Grid**. This creates a sense of dynamic movement and "unconventional" luxury.

- **Grid Model:** A 12-column fluid grid for desktop with an aggressive 32px gutter to ensure elements remain distinct.
- **Asymmetry:** Key product imagery should often break the grid or be offset by the `asymmetric-offset` value to create focal points that feel editorial rather than templated.
- **Mobile Adaptivity:** On mobile, the grid collapses to 4 columns. Asymmetric offsets are reduced to 24px or removed entirely to maintain functional tap targets.
- **Whitespace:** Use "negative-space blocks" (multiples of 64px) between sections to signal exclusivity and prevent the interface from feeling crowded.

## Elevation & Depth

This design system uses **Glassmorphism** and **Tonal Layers** rather than traditional shadows to define depth.

- **The Glass Effect:** Primary overlays (modals, navigation bars) use a 12px backdrop blur with a 10% opacity Silver-Grey border. This simulates a high-tech "head-up display" (HUD) floating over the dark interface.
- **Surface Tiers:**
    - **Tier 1 (Base):** #121212.
    - **Tier 2 (Cards):** #1C1C1E (a subtle lift from the background).
    - **Tier 3 (Popovers):** Semi-transparent Silver-Grey (5%) with heavy backdrop blur.
- **Depth Cues:** Depth is reinforced by the "Electric Cobalt" light source. Use subtle, narrow outer glows (0px 0px 15px) on active elements to simulate bioluminescence or LED indicators.

## Shapes

The shape language is "Soft" yet disciplined. While the overall vibe is technical and sharp, a slight radius prevents the UI from feeling hostile or dated.

- **Primary Radius:** 0.25rem (4px). Used for buttons and input fields to maintain a precision-machined look.
- **Large Components:** Cards and imagery use `rounded-lg` (8px) to soften the large surface areas.
- **Interactive Elements:** Checkboxes and progress bars remain strictly 0px (Sharp) or 2px to emphasize the "scientific instrument" aesthetic.

## Components

- **Buttons:** Primary buttons are Solid Cobalt (#2E5BFF) with white `label-md` text. Secondary buttons are "Ghost" style: 1px Silver-Grey border with no fill.
- **Cards:** Product cards use a #1C1C1E background with no border. Product photography should be "isolated" (PNGs with no background) to allow the charcoal surface to act as the floor.
- **Input Fields:** Bottom-border only or very subtle 1px #8E8E93 outlines. When focused, the border transitions to Cobalt with a faint outer glow.
- **Chips/Badges:** Small, rectangular tags with #1C1C1E fills and `label-sm` Silver-Grey text. Used for technical specs (e.g., "5G", "OLED").
- **Lists:** Technical specs lists should use monospaced numerals (Geist) for data alignment, separated by subtle 0.5px silver dividers.
- **Navigation:** A persistent top-bar with 20px backdrop blur, providing a "glass" bridge between content sections.