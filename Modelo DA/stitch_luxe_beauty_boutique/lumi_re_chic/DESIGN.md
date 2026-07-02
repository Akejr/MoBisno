---
name: Lumière Chic
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#464742'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#777871'
  outline-variant: '#c7c7bf'
  surface-tint: '#5e5e5b'
  primary: '#5e5e5b'
  on-primary: '#ffffff'
  primary-container: '#f9f7f2'
  on-primary-container: '#71716d'
  inverse-primary: '#c8c6c2'
  secondary: '#695c4d'
  on-secondary: '#ffffff'
  secondary-container: '#f2e0cc'
  on-secondary-container: '#706253'
  tertiary: '#735c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#fff6e7'
  on-tertiary-container: '#8a6e00'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4e2dd'
  primary-fixed-dim: '#c8c6c2'
  on-primary-fixed: '#1b1c19'
  on-primary-fixed-variant: '#474744'
  secondary-fixed: '#f2e0cc'
  secondary-fixed-dim: '#d5c4b1'
  on-secondary-fixed: '#231a0e'
  on-secondary-fixed-variant: '#514537'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 64px
    fontWeight: '400'
    lineHeight: 72px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 48px
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '300'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  section-gap: 120px
---

## Brand & Style

The design system is anchored in **Minimalist Luxury**, evoking the atmosphere of a high-end atelier. It prioritizes breathing room, deliberate composition, and a "quiet luxury" aesthetic that allows product photography to serve as the primary visual driver. 

The target audience seeks efficacy wrapped in elegance; they value the ritual of beauty as much as the results. The emotional response should be one of immediate serenity, trust, and aspiration. By utilizing expansive whitespace and a restrained decorative palette, the UI creates a premium "gallery" feel where every element feels intentional and curated.

## Colors

The palette is built on a foundation of "warm light." The primary creamy neutral (#F9F7F2) acts as the canvas, replacing stark white to provide a softer, more organic feel. The soft champagne (#E5D3C0) is used for subtle container backgrounds and secondary interactions. 

Deep charcoal (#1A1A1A) provides high-contrast legibility for typography, ensuring a modern edge that prevents the design from feeling too "bridal" or antique. Gold accents (#D4AF37) are used sparingly for high-value calls to action, active states, or iconography to denote prestige.

## Typography

This design system utilizes a high-contrast typographic pairing to signal sophistication. **Playfair Display** is used for headlines to provide a literary, editorial quality. **Montserrat** is chosen for its clean, geometric bones, used in lighter weights (300/400) for body copy to maintain an "airy" feel.

Key instructions:
- **Tracking:** Apply wider letter-spacing (0.1em) to uppercase labels and buttons to enhance the premium feel.
- **Hierarchy:** Ensure display sizes have ample margin-bottom to separate them from body text.
- **Color:** Use the deep charcoal for all primary text; use a 60% opacity of charcoal for secondary metadata.

## Layout & Spacing

The layout follows a **Fixed Grid** model on desktop to preserve the intentional composition of editorial sections, transitioning to a fluid model on mobile. 

- **Generous Gaps:** Section vertical spacing is intentionally large (120px+) to allow the user's eye to rest between product categories.
- **The "Breath" Principle:** Never crowd components. Any card or container should have internal padding of at least 32px.
- **Asymmetry:** Occasionally use offset grid placements for hero images to reinforce the "modern boutique" aesthetic.

## Elevation & Depth

Depth in this design system is achieved through **Tonal Layers** and **Ambient Shadows** rather than heavy borders.

- **Surfaces:** Use the Soft Champagne (#E5D3C0) at low opacities (10-20%) for hover states and subtle card backgrounds.
- **Shadows:** Shadows should be almost imperceptible. Use a large blur radius (30px-50px) with very low opacity (5% charcoal) to create a "lifted" effect for active cards or modals.
- **Glass:** For navigation bars, use a backdrop-blur (12px) with a semi-transparent Creamy Neutral (#F9F7F2) fill to maintain a sense of lightness and depth as the user scrolls over imagery.

## Shapes

The shape language is **Soft (0.25rem)**. While sharp edges can feel overly aggressive and high-roundedness can feel too "tech" or juvenile, a subtle 4px corner radius strikes a balance between architectural precision and organic softness.

- **Image Containers:** Should strictly follow the `rounded-sm` or `rounded-md` tokens.
- **Buttons:** Use slightly more rounded corners for small UI triggers (like "Add to Cart" icons) but maintain the Soft standard for primary buttons.

## Components

### Buttons
- **Primary:** Deep charcoal background, white text, uppercase label-sm typography. No border.
- **Secondary:** Transparent background, 1px charcoal border, charcoal text.
- **Tertiary (Luxury CTA):** Gold accent (#D4AF37) underline or text color for exclusive offers.

### Input Fields
- Use a single 1px bottom border (Deep Charcoal at 30% opacity) rather than a full box to maintain a clean, minimal look. Labels should be floating or placed above in `label-sm` style.

### Product Cards
- No visible borders. Use the Creamy Neutral background. 
- Image should have a slight zoom effect on hover. 
- Price and title should be centered or left-aligned with significant padding from the image.

### Chips & Tags
- Use the Soft Champagne (#E5D3C0) with 12px horizontal padding and `label-sm` text. Use for "New Arrival" or "Organic" labels.

### Imagery
- Photography is a component in this system. All images should have a consistent warm temperature, soft lighting, and minimal backgrounds to match the #F9F7F2 palette.