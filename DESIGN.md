---
name: Picknic
description: A calm weekly meal planner and recipe collection built around the week table.
colors:
  canvas: "#f6f3ee"
  surface: "#fffdf8"
  surface-subtle: "#ede8e0"
  ink: "#282421"
  text-secondary: "#514a44"
  muted: "#655e58"
  divider: "#dcd5cc"
  field-border: "#8a7e73"
  indigo: "#414f86"
  indigo-hover: "#343f6d"
  indigo-soft: "#e8eaf1"
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
    fontSize: "2.15rem"
    fontWeight: 680
    lineHeight: 1.12
    letterSpacing: "-0.04em"
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
  control: "4px"
  surface: "6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
---

# Design System: Picknic

## Overview

**Creative North Star: "The Quiet Week Table"**

Picknic should feel like a clear table prepared for planning, not a dashboard waiting to be administered. The interface is calm, compact, and familiar: a true neutral canvas, white working surfaces, restrained dividers, indigo actions, and food photography that supplies most of the visual richness.

The week table is the center of gravity. Recipes and Cook mode inherit the same practical vocabulary while becoming progressively more focused. Rustic or cookbook character comes through the recipe serif and imagery, never through fake paper textures, scrapbook decoration, or reduced legibility.

**Key Characteristics:**
- Dense enough to scan a full week, quiet enough to avoid cognitive load.
- Touch-friendly controls with richer hover states for pointer devices.
- Serif reserved for Picknic and recipe identity; sans-serif for all working UI.
- Structural borders and tonal layers instead of decorative shadows.

## Colors

The palette is neutral and food-led, with indigo for actions, mustard for planned dinner state, and tomato for destructive feedback.

### Primary
- **Indigo** (`#414f86`): primary actions, active navigation, selection, and focus context.
- **Deep Indigo** (`#343f6d`): hover and stronger selected text.
- **Soft Indigo** (`#e8eaf1`): selected rows, current day, and quiet active surfaces.

### Secondary
- **Dinner Mustard** (`#d6a72e`): meal-state badges and dinner emphasis, never general decoration.
- **Tomato Red** (`#b64a3a`): removal and destructive actions only.

### Neutral
- **Canvas** (`#f6f3ee`): page background.
- **Surface** (`#fffdf8`): tables, editors, controls, and recipe containers.
- **Ink** (`#282421`): headings and primary text.
- **Secondary Ink** (`#514a44`): supporting text.
- **Divider** (`#dcd5cc`): the primary structural device.

**The Food Carries Color Rule.** Keep interface color restrained so recipe photography remains the richest visual element.

## Typography

**Display Font:** Newsreader (with Georgia fallback)
**Body Font:** Geist (with Arial fallback)

**Character:** Newsreader adds familiar cookbook character to the wordmark and recipe names. Geist keeps planning, editing, ingredients, and navigation direct and highly legible.

### Hierarchy
- **Display** (400, `2rem`, 1.1): wordmark and recipe titles only.
- **Headline** (680, `1.65rem` to `2.15rem`, 1.12): primary page headings.
- **Title** (600-650, `1.125rem` to `1.25rem`, 1.3): section and recipe-card titles.
- **Body** (400, `1rem`, 1.5): instructions and explanatory text, capped around 70ch.
- **Label** (600, `0.75rem` to `0.875rem`, normal case): meals, fields, controls, and metadata.

**The Recipe Serif Rule.** Never use Newsreader for buttons, navigation, form labels, dates, or operational metadata.

## Elevation

Picknic is flat by default. Depth comes from canvas-versus-surface tone, one-pixel dividers, sticky positioning, and selected-state fills. A compact `0 4px 8px rgb(39 35 31 / 0.12)` shadow is permitted only for temporary overlays such as the add-meal menu.

**The Structural Depth Rule.** Do not pair wide ambient shadows with bordered cards; use the divider or the surface change.

## Components

### Buttons
- **Shape:** compact rounded rectangle (`4px`), minimum 40-44px touch height where space allows.
- **Primary:** Indigo with white text; Deep Indigo on hover.
- **Hover / Focus:** 180ms color transition and a visible two-pixel indigo focus outline.
- **Secondary / Ghost:** white or transparent surface with Divider border; tonal fill on hover.

### Chips
- **Style:** compact tabs or segmented controls with normal-case labels.
- **State:** selection uses an indigo underline or Soft Indigo fill, not a floating pill collection.

### Cards / Containers
- **Corner Style:** `6px` maximum for working surfaces.
- **Background:** Surface on Canvas.
- **Shadow Strategy:** none at rest.
- **Border:** one-pixel Divider.
- **Internal Padding:** `12px`, `16px`, or `24px` according to density.

### Inputs / Fields
- **Style:** Surface background, one-pixel Divider border, `4px` radius, minimum `44px` height.
- **Focus:** Indigo border plus visible focus outline.
- **Error / Disabled:** Tomato for errors; disabled controls retain shape and use reduced opacity.

### Recipe editor density

- Title and description fields grow with their content without reserving extra blank lines.
- The paste panel starts with three text rows. Its model selector and action share a wrapping row.
- Editor toolbar and settings controls use 36px targets on pointer devices above 760px. Narrow screens and touch devices retain 44px targets.
- Separate writing sections by 24px and components by 16px. Keep the ingredient and instruction rows readable.
- Below 1280px, settings follow the editor in two equal columns. A small photo preview shares the first row with the image URL; fields use the space beneath both. Below 761px, settings return to one column. Mobile bottom padding reserves space for the fixed save actions and navigation.
- The paste panel has a 4px top inset and 16px side and bottom insets.

### Navigation
- Desktop uses a quiet 196px left rail with icons and text. Active navigation uses an indigo rule and a neutral fill. At 900px and below, navigation becomes a fixed five-item bottom bar with icon-above-label targets.

### Week Table
- Seven day columns form one continuous bordered table, not seven independent cards.
- The week shows its planned meals. The recipe picker opens for a selected day and meal.
- On narrow layouts the days wrap into rows.

### Cook Session
- Keep the app sidebar visible on Cook pages and during a cook session. On mobile, keep the shared bottom navigation. Ingredients and servings occupy a separate panel inside the Cook workspace; recipe title, restrained image, and numbered steps dominate the main area.
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
