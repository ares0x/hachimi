# Hachimi Design System (v1.2.0)

> **Authority**
> This document is the **single source of truth** for Hachimi v1.2, integrating Emil Kowalski's "Skills" (motion/precision) and Craft/Codex (spatial clarity).

---

## 1. Design Principles

1.  **Light by Default**: Focus on calm, long-form reading. Dark mode is a first-class peer.
2.  **Quiet Brand**: Restrained ink-teal primary (`oklch(0.48 0.09 198)`). No neon AI glows or heavy gradients.
3.  **Document over Chat (Craft Influence)**: Center content in an `800px` column. Prioritize document flow over chat theater.
4.  **Physicality & Weight (Emil Influence)**: UI elements have weight and non-linear movement. Use inner borders (`border-alpha`) instead of heavy shadows.
5.  **Mathematical Precision**: Corner radius formula: `outer_radius = inner_radius + padding`.
6.  **Developer Craft**: Use monospace for metadata (model IDs, latency, cost) and code blocks.

---

## 2. Color System (OKLCH)

All themes use the same token names.

| Token | Light (Default) | Dark | Intent |
| :--- | :--- | :--- | :--- |
| `--background` | `oklch(0.985 0.004 85)` | `oklch(0.18 0.012 260)` | App canvas |
| `--surface` | `oklch(0.975 0.005 85)` | `oklch(0.22 0.014 260)` | Sidebars, recessed panels |
| `--surface-elevated`| `oklch(1 0 0)` | `oklch(0.26 0.016 260)` | Cards, popovers |
| `--border` | `oklch(0.92 0.006 85)` | `oklch(0.34 0.014 260)` | Quiet hairline separator |
| `--border-strong` | `oklch(0.78 0.012 85)` | `oklch(0.42 0.016 260)` | Active outline / boundary |
| `--border-alpha` | `oklch(0 0 0 / 0.06)` | `oklch(0.9 0.01 260 / 0.1)` | Inner border for depth |
| `--foreground` | `oklch(0.28 0.02 260)` | `oklch(0.95 0.008 260)` | Primary text |
| `--muted-foreground`| `oklch(0.48 0.015 260)`| `oklch(0.72 0.012 260)`| Secondary labels, meta |
| `--primary` | `oklch(0.48 0.09 198)` | `oklch(0.72 0.08 198)` | Brand (Ink Teal) |

---

## 3. Typography & Spacing

### 3.1 Families
- **Sans**: Inter, PingFang SC.
- **Mono**: JetBrains Mono.

### 3.2 Scale
- **Body**: 14px. Line-height: Latin `1.6`, CJK `1.75`.
- **Spacing**: 4px grid. Rhythm: 8px (inner) / 16px (group) / 32px (section).

---

## 4. Radius & Motion

### 4.1 Concentric Radius
- `--radius-sm`: 4px
- `--radius-md`: 8px (Standard controls)
- `--radius-lg`: 12px (Cards)
- `--radius-xl`: 18px (Containers)

### 4.2 Signature Motion
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (Non-linear ease-out).
- **Status Pulse**: 2.4s cycle. Opacity `0.3` to `1.0`, Scale `0.98` to `1.0`.
- **Press Feedback**: `scale(0.975)` with `100ms` duration.

---

## 5. Layout Patterns

- **Triptych**: Sidebar (260px) | Session (Flex-1, 800px max) | Inspector (320px).
- **Control Heights**: 32px (sm) / 40px (md) / 48px (lg).

---

## 6. Implementation Notes
- **Authority**: CSS must consume tokens. No hard-coded colors.
- **Micro-Typography**: Add 0.125em spacing between icons and CJK text.
- **Borders over Shadows**: Prefer `1px solid var(--border-alpha)` for card depth.
