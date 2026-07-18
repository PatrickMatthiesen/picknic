---
name: Picknic
description: A calm weekly meal planner and recipe collection built around the week table.
colors:
  canvas: "#f7f7f4"
  surface: "#ffffff"
  surface-subtle: "#f0f1ed"
  ink: "#27231f"
  text-secondary: "#4f4b45"
  muted: "#6d6860"
  divider: "#e7e5e1"
  sage: "#526b4f"
  sage-hover: "#40563e"
  sage-soft: "#e8eee5"
  mustard: "#d6a72e"
  tomato: "#b64a3a"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  control: "6px"
  surface: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.sage}"
    textColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.sage-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.surface}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "10px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    height: "44px"
---

# Design System: Picknic

## Overview

**Creative North Star: "The Quiet Week Table"**

Picknic should feel like a clear table prepared for planning, not a dashboard waiting to be administered. The interface is calm, compact, and familiar: a true neutral canvas, white working surfaces, restrained dividers, sage actions, and food photography that supplies most of the visual richness.

The week table is the center of gravity. Recipes and Cook mode inherit the same practical vocabulary while becoming progressively more focused. Rustic or cookbook character comes through the recipe serif and imagery, never through fake paper textures, scrapbook decoration, or reduced legibility.

**Key Characteristics:**
- Dense enough to scan a full week, quiet enough to avoid cognitive load.
- Touch-friendly controls with richer hover states for pointer devices.
- Serif reserved for Picknic and recipe identity; sans-serif for all working UI.
- Structural borders and tonal layers instead of decorative shadows.

## Colors

The palette is neutral and food-led, with sage for actions, mustard for planned dinner state, and tomato for destructive feedback.

### Primary
- **Table Sage** (`#526b4f`): primary actions, active navigation, selection, and focus context.
- **Deep Sage** (`#40563e`): hover and stronger selected text.
- **Soft Sage** (`#e8eee5`): selected rows, current day, and quiet active surfaces.

### Secondary
- **Dinner Mustard** (`#d6a72e`): meal-state badges and dinner emphasis, never general decoration.
- **Tomato Red** (`#b64a3a`): removal and destructive actions only.

### Neutral
- **Canvas** (`#f7f7f4`): page background.
- **Surface** (`#ffffff`): tables, editors, controls, and recipe containers.
- **Ink** (`#27231f`): headings and primary text.
- **Secondary Ink** (`#4f4b45`): supporting text.
- **Divider** (`#e7e5e1`): the primary structural device.

**The Food Carries Color Rule.** Keep interface color restrained so recipe photography remains the richest visual element.

## Typography

**Display Font:** Newsreader (with Georgia fallback)
**Body Font:** Geist (with Arial fallback)

**Character:** Newsreader adds familiar cookbook character to the wordmark and recipe names. Geist keeps planning, editing, ingredients, and navigation direct and highly legible.

### Hierarchy
- **Display** (400, `2rem`, 1.1): wordmark and recipe titles only.
- **Headline** (650, `1.75rem`, 1.2): primary page headings.
- **Title** (600-650, `1.125rem` to `1.25rem`, 1.3): section and recipe-card titles.
- **Body** (400, `1rem`, 1.5): instructions and explanatory text, capped around 70ch.
- **Label** (600, `0.75rem` to `0.875rem`, normal case): meals, fields, controls, and metadata.

**The Recipe Serif Rule.** Never use Newsreader for buttons, navigation, form labels, dates, or operational metadata.

## Elevation

Picknic is flat by default. Depth comes from canvas-versus-surface tone, one-pixel dividers, sticky positioning, and selected-state fills. A compact `0 4px 8px rgb(39 35 31 / 0.12)` shadow is permitted only for temporary overlays such as the add-meal menu.

**The Structural Depth Rule.** Do not pair wide ambient shadows with bordered cards; use the divider or the surface change.

## Components

### Buttons
- **Shape:** compact rounded rectangle (`6px` to `8px`), minimum 40-44px touch height where space allows.
- **Primary:** Table Sage with white text; Deep Sage on hover.
- **Hover / Focus:** 180ms color transition and a visible three-pixel sage focus outline.
- **Secondary / Ghost:** white or transparent surface with Divider border; tonal fill on hover.

### Chips
- **Style:** compact tabs or segmented controls with normal-case labels.
- **State:** selection uses a sage underline or Soft Sage fill, not a floating pill collection.

### Cards / Containers
- **Corner Style:** `8px` maximum for working surfaces.
- **Background:** Surface on Canvas.
- **Shadow Strategy:** none at rest.
- **Border:** one-pixel Divider.
- **Internal Padding:** `12px`, `16px`, or `24px` according to density.

### Inputs / Fields
- **Style:** Surface background, one-pixel Divider border, `8px` radius, minimum `44px` height.
- **Focus:** Sage border plus visible focus outline.
- **Error / Disabled:** Tomato for errors; disabled controls retain shape and use reduced opacity.

### Navigation
- Desktop uses a quiet 196px left rail with icons and text. Active navigation uses Soft Sage. At 900px and below, navigation becomes a fixed five-item bottom bar with icon-above-label targets.

### Week Table
- Seven day columns form one continuous bordered table, not seven independent cards.
- Dinner is the default visible slot; additional meals reveal progressively.
- On narrow layouts the table scrolls horizontally with stable day widths and touch-friendly snapping.

### Cook Session
- No global app navigation after entry. Ingredients and servings occupy the sidebar; recipe title, restrained image, and numbered steps dominate the main area.
- Completion is attached to each step circle. Ingredient views use `All` and `By component`.

## Do's and Don'ts

### Do:
- **Do** keep the week plan as the first and largest working surface.
- **Do** use real overhead food photography with restrained crops.
- **Do** reveal secondary controls on hover while keeping them available to touch users.
- **Do** use `4px`, `8px`, `12px`, `16px`, `24px`, and `32px` spacing steps.
- **Do** preserve practical contrast, focus visibility, reduced motion, and 44px touch targets.

### Don't:
- **Don't** build a busy enterprise dashboard that exposes every capability at once.
- **Don't** use generic glass-gradient SaaS styling, glassmorphism, gradient text, or decorative blobs.
- **Don't** turn the interface into a scrapbook; rustic influence must not overwhelm clarity.
- **Don't** nest cards, float page sections as cards, or exceed `8px` radius for working surfaces.
- **Don't** use mustard or tomato as broad decorative palette colors.
- **Don't** let recipe photos displace the actual recipe in Cook mode.
