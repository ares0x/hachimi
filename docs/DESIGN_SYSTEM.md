# Hachimi Design System

> **Authority**
>
> This document is the **intended single source of truth** for Hachimi visual and interaction design across Desktop (`apps/desktop`), Web (`packages/channels/web`), and UI prototypes (`UIs/`).
>
> If a surface claims to follow this system but its CSS does not match these tokens, **the implementation is wrong**—except where §13 explicitly lists non-conforming shipped surfaces that still need a restyle pass.
>
> Change the product look only by updating this document first, then tokens and components.

**Version:** 1.1.0
**Default theme:** Light
**Brand posture:** Calm tool, not neon AI chrome

---

## Table of contents

1. [Design principles](#1-design-principles)
2. [Brand and identity](#2-brand-and-identity)
3. [Color system](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing, radius, shadow, control heights](#5-spacing-radius-shadow-control-heights)
6. [Iconography](#6-iconography)
7. [Motion](#7-motion)
8. [Components](#8-components)
9. [Layout patterns](#9-layout-patterns)
10. [States and feedback](#10-states-and-feedback)
11. [Window chrome and platforms](#11-window-chrome-and-platforms)
12. [Accessibility](#12-accessibility)
13. [Implementation notes](#13-implementation-notes)
14. [Component vocabulary (for humans and agents)](#14-component-vocabulary-for-humans-and-agents)
15. [Keyboard shortcuts (baseline)](#15-keyboard-shortcuts-baseline)
16. [Changelog](#16-changelog)

---

## 1. Design principles

1. **Light by default**
   Daytime, long reading, and calm focus are first-class. Dark is an equal-quality alternate theme, not the product identity.

2. **Quiet brand**
   No pink–orange gradients, no purple “AI default,” no pure black (`#000`) full-bleed canvases, no radial dark-sky gradients as app chrome, no glassmorphism (heavy `backdrop-filter` + ambient shadow stacks) as the default shell. Primary is a restrained cool accent. Personality comes from typography, spacing, and a few Hachimi-specific cues—not neon.

3. **Assistant, not avatar theater**
   Hachimi understands the user; it is **not** the user. UI may show an assistant identity (name, mark, status) but must not dominate the workspace like a character stage. One primary conversation surface; specialized modes (code, research) are tools/scenes—not a swarm of peer “agents” competing for attention.

4. **Developer craft**
   Model ids, latency, cost, paths, and code use monospace. Hierarchy prefers **borders and subtle surfaces** over heavy drop shadows (especially in Dark).

5. **Density with breath**
   Avoid sparse marketing layouts. Keep metadata visible where it helps trust (model, tools, memory hits) without turning every row into a dashboard.

6. **Icons over emoji in chrome**
   Navigation and system status use **Lucide** (or equivalent) + semantic color. Emoji only in user content or user-chosen skill icons.

7. **Constraints in the harness, not in decoration**
   Permission, sandbox, and errors must be readable and honest. Visual design supports the security model; it does not hide it.

8. **Borrow craft, not identity**
   Spacing rhythm, control heights, and focus rings may follow mature dev UI practice (e.g. Geist-like ladders). Do **not** adopt neutral black-and-white as the brand primary. Shared “good taste” alone is not a brand—see §2.4.

### 1.1 Copy casing (English)

| Context | Rule | Example |
|---------|------|---------|
| Buttons, menus, empty states | Sentence case | `Get started`, `Save key` |
| Section labels in sidebars | Small caps or uppercase + tracking | `Sessions` / `SESSIONS` |
| Product names | Fixed spelling | Hachimi, Providers, Gateway |
| Short status badges | Sentence or fixed glossary | `Configured`, `fallback` |
| Slash commands | Lowercase mono | `/evidence` |

Chinese: natural sentence style. Module names may be Chinese, English, or `中文 (English)` once per screen—do not mix three forms for the same concept. Quotation and punctuation: use Chinese full-width punctuation in Chinese sentences (`「」` / `“”` as appropriate to locale preference; be consistent within a surface).

---

## 2. Brand and identity

### 2.1 Primary accent

- **Hue family:** cool **ink-teal** — primary around **oklch hue ~195–200** (slightly greener than generic “SaaS blue,” cooler than consumer mint). Intentionally offset from Linear-like blue-violet and from pure marketing teal.
- **Usage:** links, selected rail, primary buttons, focus-adjacent accents, key status.
- **Not for:** full-window gradients, large glowing orbs, every list bullet.

There is **no brand gradient** as required chrome. Optional two-stop blend for the logo mark only (same hue family, low chroma).

### 2.2 Logo mark (GUI)

- Simple geometric mark (rounded square or restrained monogram) in **primary + neutral**.
- Sidebar top: ~22–24px.
- Avoid multicolor pink/orange/blue candy dots and neon glow.

### 2.3 Assistant mark (optional)

| Role | Mark | Color token |
|------|------|-------------|
| Assistant (default) | Soft circle or monogram | `--primary` |
| Code mode | `</>` in rounded rect | `--mode-code` |
| Research mode | Simple ring / search geometry | `--mode-research` |
| Writing | Scene chip only—not a peer agent entry | `--mode-write` |

Do not use photographic avatars or emoji as system identity in the GUI.

### 2.4 What makes Hachimi recognizable (GUI)

Shared craft (Inter, mono metadata, Lucide, 4px grid, document-flow assistant messages) is **not** differentiation by itself. GUI identity is carried by the combination of:

1. **Ink-teal primary (hue ~195–200)** rather than generic blue or black primary.
2. **Assistant as document flow** (no heavy assistant chat bubbles) on a **light paper canvas** by default.
3. **Signature micro-motion:** the running status dot uses a **slow single-cycle opacity pulse** (not scale bounce, not brand-colored ambient glow).
4. Optional **wordmark letter-spacing** on the product name in the sidebar: slightly open tracking on “Hachimi” only (not on body text).

Blind-test goal: a screenshot should feel quieter than neon AI apps and slightly **greener-ink** than default shadcn blue kits—not interchangeable with an arbitrary Vercel template.

### 2.5 TUI vs GUI identity

The **TUI** may keep the playful “哈基米” / ASCII cat welcome as an intentional easter egg for that surface only. That mark is **not** part of the GUI brand system described here and must not be ported into Desktop/Web chrome as a default mascot stage. TUI wink, GUI calm—deliberate layering, not an accidental omission.

---

## 3. Color system

All interactive themes expose the **same token names**. Values differ per theme.

### 3.1 Shared semantic intent

| Token | Intent |
|-------|--------|
| `--background` | App canvas |
| `--surface` | Sidebars, bars, recessed panels |
| `--surface-elevated` | Cards, raised rows, popovers |
| `--surface-hover` | Row/button hover fill |
| `--surface-active` | Pressed or selected fill |
| `--border` | Default divider (quiet hairline—see §3.4) |
| `--border-strong` | Strong edge / active outline / structural boundary you should notice |
| `--border-alpha` | Translucent hairline on any fill |
| `--foreground` | Primary text |
| `--muted-foreground` | Secondary labels **and body-sized metadata** (timestamps, section labels at 12–13px) |
| `--subtle-foreground` | **Large or non-text only** by default—see usage rule below |
| `--primary` | Brand accent |
| `--primary-foreground` | Text on primary fill |
| `--accent` | Secondary cool accent (links/info kinship) |
| `--success` / `--warning` / `--danger` / `--info` | Status |
| `--focus-ring` | `:focus-visible` outer ring color |
| `--mode-code` / `--mode-research` / `--mode-write` | Mode tints |

**`--subtle-foreground` usage rule:**
Do **not** use for body-sized (≈12–14px) text. Reserved for large decorative icons, disabled affordances at ≥18px, or truly tertiary ornament. Timestamps, sidebar section labels, placeholders, and mono meta lines use **`--muted-foreground`** so AA contrast holds.

### 3.2 Light theme (default)

```css
:root,
[data-theme="light"] {
  /* Layers — warm paper, not pure #fff wall */
  --background: oklch(0.985 0.004 85);
  --surface: oklch(0.97 0.005 85);
  --surface-elevated: oklch(1 0.002 85);
  --surface-hover: oklch(0.94 0.006 85);
  --surface-active: oklch(0.92 0.008 85);

  --border: oklch(0.88 0.008 85);
  --border-strong: oklch(0.78 0.012 85);
  --border-alpha: oklch(0.4 0.02 200 / 0.12);

  /* Text — cool gray, never pure black */
  --foreground: oklch(0.28 0.02 260);
  --muted-foreground: oklch(0.48 0.015 260);
  /* Darkened vs v1.0 for AA if ever used at 14px; prefer muted for small text */
  --subtle-foreground: oklch(0.56 0.012 260);

  /* Brand — ink-teal (~hue 198) */
  --primary: oklch(0.48 0.09 198);
  --primary-foreground: oklch(0.99 0.002 85);
  --accent: oklch(0.5 0.08 210);

  --mode-code: oklch(0.5 0.1 250);
  --mode-research: oklch(0.48 0.09 160);
  --mode-write: oklch(0.5 0.06 280);

  --success: oklch(0.5 0.12 155);
  --warning: oklch(0.55 0.12 75);
  --danger: oklch(0.5 0.16 25);
  --info: oklch(0.5 0.09 210);

  --focus-ring: color-mix(in oklch, var(--primary) 70%, oklch(0.4 0.05 198));

  --shadow-sm: 0 1px 2px oklch(0.3 0.02 260 / 0.06);
  --shadow-md: 0 4px 14px oklch(0.3 0.02 260 / 0.08);
}
```

### 3.3 Dark theme (optional, first-class quality)

```css
[data-theme="dark"] {
  --background: oklch(0.18 0.012 260);
  --surface: oklch(0.22 0.014 260);
  --surface-elevated: oklch(0.26 0.016 260);
  --surface-hover: oklch(0.28 0.016 260);
  --surface-active: oklch(0.3 0.018 260);

  --border: oklch(0.34 0.014 260);
  --border-strong: oklch(0.42 0.016 260);
  --border-alpha: oklch(0.9 0.01 260 / 0.1);

  --foreground: oklch(0.95 0.008 260);
  --muted-foreground: oklch(0.72 0.012 260);
  /* Lightened vs v1.0 for AA margin if used large; small text still prefers muted */
  --subtle-foreground: oklch(0.62 0.012 260);

  --primary: oklch(0.72 0.08 198);
  --primary-foreground: oklch(0.18 0.02 260);
  --accent: oklch(0.7 0.08 210);

  --mode-code: oklch(0.72 0.1 250);
  --mode-research: oklch(0.72 0.1 160);
  --mode-write: oklch(0.72 0.06 280);

  --success: oklch(0.72 0.12 155);
  --warning: oklch(0.78 0.12 85);
  --danger: oklch(0.68 0.16 25);
  --info: oklch(0.72 0.09 210);

  --focus-ring: color-mix(in oklch, var(--primary) 75%, white);

  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.35);
  --shadow-md: 0 4px 16px oklch(0 0 0 / 0.4);
}
```

### 3.4 Usage rules

- **Separators:** default `--border` is a **deliberate quiet hairline** (~1.3:1 on light canvas)—felt more than “read” as a strong boundary. It is **not** meant to carry WCAG non-text 3:1 structural contrast by itself. When a boundary must be consciously perceived (selected panel edge, modal frame, focused well), use **`--border-strong`** or surface change.
- **Hover:** `--surface-hover` or translucent elevated.
- **Selected nav:** `--surface-active` + **2px left rail** in `--primary` (or mode color in mode lists).
- **Primary fill:** solid `--primary` (no gradient required).
- **Danger / warning / success:** semantic only; never color-only status.
- **Forbidden chrome:** full-viewport radial gradients, default glass blur stacks, heavy ambient black shadows as the page background.

### 3.5 Focus

```css
:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--background),
    0 0 0 4px var(--focus-ring);
}
```

Do not remove focus styles without an equivalent.

---

## 4. Typography

### 4.1 Families

```css
--font-sans: "Inter", "PingFang SC", "Noto Sans SC", "Source Han Sans SC",
             "Microsoft YaHei", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", "Cascadia Code", ui-monospace, monospace;
```

- Latin UI prefers Inter; **CJK glyphs fall through** to PingFang SC / Noto Sans SC / Source Han Sans SC.
- Do not force a Latin display face on Chinese chrome.
- Optional display face only for rare marketing/onboarding titles—not app chrome.

### 4.2 Scale

| Token | Size / line | Weight | Use |
|-------|-------------|--------|-----|
| `text-display` | 28 / 34 | 600 | Rare page titles |
| `text-title` | 20 / 28 | 600 | Session header |
| `text-h` | 16 / 22 | 600 | Card titles |
| `text-body` | 14 / 22–24 | 400 | Message body (default) |
| `text-label` | 13 / 18 | 500 | Form labels, scan lines |
| `text-sm` | 13 / 20 | 400 | Sidebar rows, metadata |
| `text-xs` | 12 / 16–18 | 500 | Section labels, badges |
| `text-mono` | 13 / 20 | 400 | Code, model id, latency, cost |

### 4.3 Latin vs CJK

| Topic | Rule |
|-------|------|
| Body size | 14px for both; do not shrink CJK to “fit” Latin metrics |
| Line-height | Latin body ~**1.55–1.65**; **primarily Chinese paragraphs ~1.7–1.85** (CJK reads heavier at the same px) |
| Mixed lines | Use the CJK-friendly line-height when a block is mostly Chinese |
| Punctuation | Chinese copy uses full-width punctuation; avoid mixing half-width `,` `.` inside Chinese clauses |
| Font feature | Avoid aggressive Latin ligature settings that break CJK fallback |
| Mono + CJK | Tool output stays mono; surrounding prose stays sans |

### 4.4 Rules

- Code blocks and tool paths: always mono.
- Model ids, latency, cost: mono + `--muted-foreground`.
- Placeholders: `--muted-foreground`, not `--subtle-foreground`.

---

## 5. Spacing, radius, shadow, control heights

### 5.1 Spacing (4px grid)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

Rhythm: **8px within groups · 16px between groups · 32–40px major sections**.

### 5.2 Control heights (single ladder)

| Token | Height | Use |
|-------|--------|-----|
| `--control-h-sm` | **32px** | Toolbar chips, icon buttons, dense rows |
| `--control-h-md` | **40px** | Default inputs and buttons |
| `--control-h-lg` | **48px** | Onboarding primary only |

Do not invent 28 / 34 / 36 heights in product UI.

### 5.3 Radius

```css
--radius-control: 6px;
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 12px;
--radius-xl: 16px;
```

### 5.4 Shadow

- **Light:** `--shadow-sm` / `--shadow-md` on elevated cards and popovers, always with border.
- **Dark:** prefer border; shadows optional and soft.
- **No** large primary-colored ambient glow as permanent chrome.
- **No** default `box-shadow: 0 8px 32px rgba(0,0,0,0.37)` page chrome.

---

## 6. Iconography

### 6.1 Library

**Lucide** (stroke icons), consistent with common shadcn-style stacks.

### 6.2 Sizes

| Context | Size | Stroke |
|---------|------|--------|
| Inline / sidebar | 16px | 1.75 |
| Toolbar buttons | 18px | 1.75 |
| Empty states | 24–32px | 1.5 |

### 6.3 Status dots

- **8px** circle.
- Running: **opacity-only** pulse (see §2.4)—not scale bounce. Color `--info`.
- Idle/ok: `--success`. Error: `--danger`. Neutral: `--border-strong`.

Respect `prefers-reduced-motion: reduce` (static dot).

---

## 7. Motion

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
--dur-fast: 120ms;
--dur-base: 200ms;
--dur-slow: 320ms;
```

| Scene | Easing | Duration |
|-------|--------|----------|
| Hover / focus | ease-out | fast |
| Button state | ease-out | base |
| Panel open | ease-out | base–slow |
| Page section change | ease-inout | slow |
| Status pulse | ease-out loop | ~1.4s opacity |

---

## 8. Components

### 8.1 Button

| Variant | Use | Style |
|---------|-----|--------|
| `primary` | Main CTA | Solid `--primary`, `--primary-foreground` |
| `secondary` | Secondary actions | Elevated surface + border |
| `ghost` | Toolbar / icon | Transparent; hover `--surface-hover` |
| `destructive` | Delete / forget | Danger tint bg + danger text |

Heights: **sm 32 · md 40 · lg 48** only. Icon-only: square, `radius-md`.

### 8.2 Card

- Background `--surface` or `--surface-elevated`, border `--border`, `radius-lg`, padding `--space-4`.
- Hover: `--border-strong`. Selected: `--surface-active` and/or primary rail.

### 8.3 Input / Composer

- Composer = textarea + bottom toolbar (`@`, `/`, attach, send).
- Focus: border toward primary + focus ring.
- Footer: mono hints for shortcuts.
- Slash/@ menus: low-alpha primary highlight.

### 8.4 Form controls (Settings and dialogs)

| Control | Spec |
|---------|------|
| **Text input** | Height `--control-h-md`, `radius-control`, border `--border`, padding inline 12px |
| **Select** | Same height as text input; chevron 16px muted |
| **Checkbox** | 16×16 hit visual, 32px min touch row height; checked fill `--primary` |
| **Radio** | Same row height rules as checkbox |
| **Toggle / switch** | Track ~32×20, thumb 16; on-state `--primary` |
| **Slider** | Track 4px, thumb 16px; focus ring on thumb |
| **Label** | `text-label`, `--foreground`; help text `text-sm` + `--muted-foreground` |
| **Field gap** | 8px label→control, 16px between fields |

Disabled: lower opacity + `cursor: not-allowed`; do not rely on color alone.

### 8.5 Badge

Prefer Lucide mini + text or neutral pill.

| State | Treatment |
|-------|-----------|
| Todo | Border only + label |
| Running | Info tint + opacity-pulse dot |
| Waiting | Warning tint |
| Done | Success tint |
| Sandbox | Warning tint + shield/box icon |
| Ask / Auto | Explicit text; Auto uses warning/danger tint if elevated trust |

No decorative emoji in system chrome.

### 8.6 Sidebar item

- Default: muted text, comfortable padding, `radius-md`.
- Hover: `--surface-hover`. Active: `--surface-active`, **2px primary left rail**.
- Subtitle / time: `text-xs` + **`--muted-foreground`**.
- Section headers: `text-xs` + **`--muted-foreground`**.

### 8.7 Message presentation

- **User:** right-aligned bubble, `--surface-elevated`, max-width ~75%, `radius-lg`.
- **Assistant:** **document flow**—no heavy chat card, no brand left stripe. Optional quiet identity row (mark + name + mono time with `--muted-foreground`).
- Column: `max-width: min(52rem, 100%)` aligned with composer.
- Hover actions: floating toolbar (Copy / Quote / Remember).
- **Tool calls:** collapsed strip by default (`N tool calls`).

#### 8.7.1 Markdown inside messages

Assistant (and user, when applicable) markdown renders **inside** the message column using these rules:

| Element | Treatment |
|---------|-----------|
| Paragraphs | `text-body`; spacing `--space-3` between blocks |
| `h1`–`h3` | Rare in-stream; `text-title` / `text-h` / 15px semibold; margin-top `--space-4` |
| `h4`–`h6` | `text-label` semibold |
| Unordered list | Disc outside; padding-left `--space-5`; item gap 4–6px |
| Ordered list | Decimal; same padding |
| Nested lists | Additional `--space-4` indent |
| Blockquote | Left border 2px `--border-strong`, padding-left `--space-3`, muted text |
| Inline code | mono, `--surface-hover` chip, `radius-sm`, px 4 |
| Code fence | mono `text-mono`, `--surface` background, border, `radius-md`, padding `--space-3`, horizontal scroll |
| Table | Full width of column; header row `--surface`; cell padding 8×12; border `--border` |
| Links | `--primary` / `--accent`; underline on hover |
| HR | 1px `--border`, margin `--space-4` 0 |
| Images | Max-width 100%; `radius-md`; no infinite height |

Do not style markdown headings as marketing display type inside the stream.

#### 8.7.2 Citations and sources

When the assistant uses web search or external evidence:

- **Inline citation:** superscript or bracket form `[1]` in `--muted-foreground`, mono optional; click/tap scrolls to source list or opens link.
- **Source list:** end of turn or Context Panel **Sources** tab—title, domain, favicon optional, link with clear external indicator.
- **Footnote style:** small meta row under the paragraph is allowed; do not use neon chips.
- Missing URL: show title + “source unavailable” in muted text, not a dead primary button.

### 8.8 Tooltip

| Property | Value |
|----------|--------|
| Delay show | **400ms** (avoid tooltip spam on dense toolbars) |
| Delay hide | **100ms** |
| Max width | **240px** (up to 320px for explanatory settings copy) |
| Padding | 6px 10px |
| Type | `text-xs` or `text-sm`, `--foreground` on `--surface-elevated` |
| Border | `--border` |
| Shadow | `--shadow-sm` (light) |
| Radius | `--radius-sm` |
| Position | Prefer **top** or **bottom** of trigger; flip when clipped |
| Pointer | Optional 4px caret; not required |
| Motion | Opacity only, `--dur-fast`; disabled when reduced motion |

Do not put critical permissions only in tooltips.

### 8.9 Diff viewer

- Mono line numbers, muted foreground.
- Add: success wash + left border. Del: danger wash + left border.

### 8.10 Permission / HITL

- Prefer **docked sheet** above composer.
- Global modal only for irreversible cross-session actions.

---

## 9. Layout patterns

### 9.1 Triptych (default desktop / wide web)

```text
┌────────────┬─────────────────────┬──────────────┐
│ Sidebar    │ Session             │ Context      │
│ 220–300px  │ flex-1 min-w-0      │ ~280–320px   │
│            │ overflow hidden     │ collapsible  │
└────────────┴─────────────────────┴──────────────┘
```

- Center: **`min-w-0 flex-1 overflow-hidden`**.
- Resize handles on splits.

### 9.2 Responsive breakpoints (Web channel)

| Name | Width | Layout behavior |
|------|-------|-----------------|
| **expanded** | ≥1100px | Full triptych; context open optional |
| **medium** | 768–1099px | Sidebar + session; context **drawer/overlay** (not persistent third column) |
| **compact** | &lt;768px | Single column: session first; sidebar as **sheet/drawer**; context as sheet; composer sticky bottom |

- Do not keep three simultaneous columns on phone widths.
- Tables in markdown: horizontal scroll inside message column, not page-wide overflow.

### 9.3 Sidebar structure (suggested)

1. Mark + product name (drag region on desktop).
2. Compact assistant status (name, counts, status dot)—not a hero character panel.
3. Modes / tools as secondary nav.
4. Sessions list (collapsible).
5. Footer: Command palette, Settings.

### 9.4 Session / code / memory

- Session: header ~44px, centered message column, pinned composer.
- Code mode: breadcrumb + permission badge + plan/diff + composer.
- Memory: tree + timeline + detail with confirmed Forget.

---

## 10. States and feedback

### 10.1 Empty states

Icon + title (statement) + one guidance line + optional CTA. Errors: **what happened + next step**.

### 10.2 Loading

| Level | Use | UI |
|-------|-----|-----|
| L0 | Button | 12px spinner |
| L1 | Thinking | One muted line; optional soft shimmer |
| L2 | Streaming | Stream in place |
| L3 | Background task | Status dot + thin progress + mono meta |
| L4 | Panel load | Skeleton cards |
| L5 | Optimistic send | User bubble immediately |

### 10.3 Toasts

| Case | Duration |
|------|----------|
| Success | ~2.5s |
| Info | ~3s |
| Destructive / undo | ~5s |

**Stacking:**

- Position: **bottom-right** (Desktop/Web LTR); 16px margin from edges.
- Newest **above** older (or below—pick one and keep it: **newest on top**).
- **Max visible: 3**; additional toasts collapse into a “+N more” chip that expands the stack.
- Same-id updates replace in place (e.g. progress) instead of spawning duplicates.
- Focusable dismiss control; do not steal focus from composer on each toast.

---

## 11. Window chrome and platforms

### 11.1 Electron

- macOS: `hiddenInset`, header drag, traffic-light spacer ~56px.
- Windows/Linux: standard title bar acceptable.

### 11.2 Tauri / other shells

Same tokens; shell-specific drag APIs only.

### 11.3 Web

Same tokens; apply §9.2 breakpoints. No traffic-light spacer.

---

## 12. Accessibility

- Body and controls: **WCAG AA** targets—**4.5:1** normal text, **3:1** large text / meaningful non-text UI where required.
- **`--muted-foreground` on `--surface`** is the approved pair for small metadata.
- **`--subtle-foreground`** is not approved for 12–14px text (see §3.1).
- Focus visible; status not color-only; min control height 32px where practical.
- `prefers-reduced-motion: reduce` disables pulse and non-essential motion.
- Destructive actions need confirmation.

Re-verify contrast in CI or with a contrast checker when tokens change—especially `--muted-foreground` / `--surface` and `--primary-foreground` / `--primary`.

---

## 13. Implementation notes

1. Define tokens once as CSS variables (or Tailwind theme maps to the same names).
2. Theme switch: `data-theme="light" | "dark"` on `documentElement`; default **`light`**.
3. Components consume tokens only—no hard-coded neon gradients in product UI.
4. **Shipped Web UI gap (blocking for “authority in practice”):**
   `packages/channels/web` is a **shipped, in-use surface**, not a disposable prototype under `UIs/`. As of this writing it still uses patterns that **violate** this system (e.g. radial dark gradient canvas, glass-style blur, heavy ambient shadows in `public/style.css`). Those must be **fully restyled** (flat token backgrounds, borders over blur/heavy shadow, light default) before this document can be treated as authoritative **in production**, not only on paper. Until that pass lands, treat Web as **non-conformant** and prioritize the restyle.
5. Prototypes under `UIs/` may lag; do not ship new features that extend the old glass/gradient shell.
6. Control heights and message/markdown rules belong in UI PR review checklists.

Suggested base:

```css
html {
  color-scheme: light;
}
html[data-theme="dark"] {
  color-scheme: dark;
}
body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.55;
}
```

For predominantly Chinese message bodies, prefer `line-height: 1.75` on `.message-body`.

---

## 14. Component vocabulary (for humans and agents)

| Hachimi name | Standard name | Notes |
|--------------|---------------|--------|
| App Sidebar | Sidebar / source list | Left nav |
| Session | Conversation pane | Center |
| Composer | Prompt / message compose | Bottom input |
| Context Panel | Inspector | Right / drawer on medium |
| Permission card | Sheet / docked panel | Above composer |
| Command palette | Command palette | ⌘K / Ctrl+K |
| Message (user) | Chat bubble | Right aligned |
| Message (assistant) | Document-style message | No heavy card |
| Tooltip | Tooltip | §8.8 |
| Toast | Toast | §10.3 stacking |
| Citation | Inline citation / source list | §8.7.2 |
| StatusDot | Status indicator | Opacity pulse when running |
| Diff | Diff viewer | Add/del washes |
| Empty state | Empty state | Icon + title + help |

Agent prompt sketch:

```text
Update <Hachimi name> (standard: <name>) following DESIGN-SYSTEM.md.
Light default, ink-teal tokens, control heights 32/40/48.
No radial dark gradients, glass blur chrome, or pink–orange accents.
```

---

## 15. Keyboard shortcuts (baseline)

Document these in Settings → Shortcuts / Help. Platform: ⌘ = Meta on macOS, Ctrl on Windows/Linux.

| Action | Shortcut |
|--------|----------|
| Command palette | ⌘K |
| New session | ⌘N |
| Focus composer | ⌘J (or `` Ctrl+` `` if conflict—pick one in implementation and keep stable) |
| Send message | ⌘Enter (Enter alone may newline in multiline; document the choice) |
| Toggle context / inspector | ⌘\ |
| Toggle sidebar | ⌘B |
| Settings | ⌘, |
| Cancel / abort run | Escape |
| Copy last assistant message | ⌘ShiftC (optional) |

Do not bind destructive forget/delete to a single key without confirmation.

---

## 16. Changelog

### 1.1.0

- Marked shipped Web UI non-conformance and required restyle in §13.
- Fixed `--subtle-foreground` values and restricted usage; small text → `--muted-foreground`.
- Documented intentional quiet hairline borders vs `--border-strong`.
- Brand: ink-teal hue ~198, signature opacity pulse, TUI cat vs GUI calm.
- Added: Markdown-in-message, citations, tooltip, form controls, toast stacking, web breakpoints, CJK type rules, keyboard baseline.
- Authority wording: paper vs production until Web matches tokens.

### 1.0.0

- Initial calm, light-default system; removed pink–orange / night-owl defaults.

---

*Hachimi Design System — quiet tools, durable local assistant, honest surfaces.*
