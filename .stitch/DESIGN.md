---
name: SmartBudget Design System
colors:
  background: "#f8f9fa"
  foreground: "#1e293b"
  primary: "#0f766e"
  primary-foreground: "#ffffff"
  secondary: "#f1f5f9"
  secondary-foreground: "#0f172a"
  muted: "#f1f5f9"
  muted-foreground: "#64748b"
  accent: "#d97706"
  accent-foreground: "#1e293b"
  card: "#ffffff"
  card-foreground: "#1e293b"
  border: "rgba(30, 41, 59, 0.08)"
---

# Design System: SmartBudget Settings & Dashboard
**Project ID:** smartbudget-v1

## 1. Visual Theme & Atmosphere
SmartBudget is a modern zero-based family budgeting application. The interface feels lightweight, tactile, and responsive with a soft neutral sand canvas (`#f8f9fa`) and rich deep emerald-teal primary accents (`#0f766e`). Every action feels deliberate and smooth with micro-animations, glassmorphism badges, and fluid 3D card lift shadows.

The layout is desktop and mobile optimized with a pill-segmented settings control dashboard, interactive color theme swatches (10 presets), biometrics biometric lock triggers, and isolated home database management.

## 2. Color Palette & Roles
### Primary Foundation
- **Canvas / Root Background** (`#f8f9fa` / `oklch(0.972 0.008 85)`): Soft sand paper background.
- **Card Surface** (`#ffffff` / `oklch(1 0 0)`): Crisp white floating surfaces with subtle border strokes.
- **Dark Mode Background** (`oklch(0.18 0.008 60)`): Deep warm slate dark theme background.

### Accent & Interactive
- **SmartBudget Emerald** (`#0f766e` / `oklch(0.483 0.093 179)`): Primary CTA buttons, active tab indicators, and progress bars.
- **Warm Gold Accent** (`#d97706` / `oklch(0.774 0.113 62)`): Highlights, secondary pill badges, and rupee currency indicators.
- **10 Presets**: Emerald, Ocean Blue, Sunset Rose, Cyber Neon, Midnight Obsidian, Crimson Velvet, Forest Sage, Solar Amber, Lavender Mist, Nordic Frost.

### Typography & Text Hierarchy
- **Primary Text** (`#1e293b`): High-contrast slate body text.
- **Muted Subtext** (`#64748b`): Secondary labels and captions.

## 3. Typography Rules
- **Display & Numbers**: `Sora`, sans-serif (bold geometric numbers and headings).
- **Body & Controls**: `Manrope`, sans-serif (clean legible interface copy).

## 4. Component Stylings
### Segmented Tab Pill Navigation
- Rounded pill buttons (`rounded-2xl`) with horizontal smooth scrollbar hiding, active primary gradient fills (`gradient-primary`), and crisp icon labels.

### Settings Cards
- `rounded-3xl` cards with `1px` subtle borders (`border-border`), padding (`p-6`), header icon badges, and structured row grids.

### Color Theme Swatches
- `rounded-2xl` interactive swatch buttons with dual-color circular badges, active ring indicator, and checkmark pill.

## 5. Layout Principles
- **Grid Structure**: Max-width `max-w-5xl` container, 12-column responsive layout, fluid touch targets (`min-h-[44px]`).
- **Responsive Behavior**: Mobile-first with bottom navigation bar and desktop sidebar.
