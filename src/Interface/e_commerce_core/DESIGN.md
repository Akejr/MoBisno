---
name: E-Commerce Core
colors:
  surface: '#fff8f6'
  surface-dim: '#f1d4ca'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ec'
  surface-container: '#ffe9e2'
  surface-container-high: '#ffe2d8'
  surface-container-highest: '#fadcd2'
  on-surface: '#271812'
  on-surface-variant: '#5b4137'
  inverse-surface: '#3e2c26'
  inverse-on-surface: '#ffede7'
  outline: '#8f7065'
  outline-variant: '#e4beb1'
  surface-tint: '#a73a00'
  primary: '#a73a00'
  on-primary: '#ffffff'
  primary-container: '#ff5c00'
  on-primary-container: '#521800'
  inverse-primary: '#ffb59a'
  secondary: '#5c5f60'
  on-secondary: '#ffffff'
  secondary-container: '#e1e3e4'
  on-secondary-container: '#626566'
  tertiary: '#575e70'
  on-tertiary: '#ffffff'
  tertiary-container: '#8b92a6'
  on-tertiary-container: '#242b3b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb59a'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#802a00'
  secondary-fixed: '#e1e3e4'
  secondary-fixed-dim: '#c5c7c8'
  on-secondary-fixed: '#191c1d'
  on-secondary-fixed-variant: '#454748'
  tertiary-fixed: '#dce2f7'
  tertiary-fixed-dim: '#c0c6db'
  on-tertiary-fixed: '#141b2b'
  on-tertiary-fixed-variant: '#404758'
  background: '#fff8f6'
  on-background: '#271812'
  surface-variant: '#fadcd2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is built to empower Angolan entrepreneurs by blending high-energy "startup" aesthetics with professional, trustworthy SaaS foundations. The visual narrative centers on **Modern Minimalism**—prioritizing clarity, speed, and ease of use for merchants who may be transitioning their businesses online for the first time.

The style is defined by a "vibrant-professional" dichotomy: using a high-energy primary orange to drive action and excitement, balanced against vast whitespace and a sophisticated neutral palette to maintain a sense of reliable infrastructure. This approach ensures the UI feels light and responsive while remaining authoritative enough to handle financial transactions and inventory management.

## Colors

The palette is anchored by a **Vibrant Orange**, pulled directly from the brand's visual identity to symbolize energy and commerce. 

- **Primary Orange:** Reserved for high-priority calls to action, progress indicators, and active states.
- **Neutrals:** A range of cool grays provides structure. `#111827` (Dark Gray/Black) is used for maximum legibility in typography, while `#F9FAFB` creates subtle depth between surface layers.
- **Semantic Colors:** Green is specifically tuned to be "Payment-Success" friendly, evoking confidence during Multicaixa or MCX Express transactions. Red and Amber are used sparingly for inventory alerts and system errors.

## Typography

This design system utilizes **Inter** for all layers of the interface. Inter’s tall x-height and neutral character provide the "SaaS" feel required for a professional platform while remaining highly legible across mobile devices—crucial for store management on the go.

- **Headlines:** Use tighter letter-spacing and heavier weights to create a strong visual anchor.
- **Body:** Standardized at 16px for optimal readability.
- **Labels:** Utilizes a medium weight to differentiate functional text (like input labels or button text) from narrative body content.

## Layout & Spacing

The layout follows a **Fluid Grid** system with a focus on generous whitespace to reduce cognitive load for non-technical users. 

- **Grid:** A 12-column grid on desktop, collapsing to 4 columns on mobile. 
- **Rhythm:** An 8px linear scale governs all spacing. Vertical stacks typically use 16px (`stack-md`) for related elements and 32px (`stack-lg`) to separate distinct sections.
- **Safe Areas:** Large margins (32px on desktop) ensure the content feels "framed" and premium, rather than cluttered.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** and **Ambient Shadows**. Instead of heavy borders, this design system uses soft, diffused shadows to lift interactive elements from the background.

- **Level 0 (Background):** `#F9FAFB` or `#FFFFFF`.
- **Level 1 (Cards/Inputs):** White surface with a 1px border (`#E5E7EB`) and a very soft, 12% opacity shadow with a large blur radius (16px-24px).
- **Level 2 (Dropdowns/Modals):** White surface with a more pronounced shadow (18% opacity) to indicate temporary overlay status.

Shadows should always use a slight tint of the neutral dark color to prevent them from looking "muddy."

## Shapes

The shape language is defined by **Large Rounded Corners**, signaling a modern, approachable brand. 

- **Base Radius:** 12px (0.75rem) for small components like input fields and buttons.
- **Large Radius:** 16px (1rem) for containers, cards, and section wrappers.
- **Full Radius:** Used exclusively for tags, chips, and specific status badges to distinguish them from actionable buttons.