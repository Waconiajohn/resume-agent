# CLAUDE.md — FirstSourceTeam Design System

> **Read this before writing any UI code.** This document is the contract between the designers and Claude Code. Every screen, component, and style decision should trace back to something in here.

This folder is a complete design system for **FirstSourceTeam** (FST) — a career transition and outplacement firm. It covers four product surfaces: the marketing website, the CareerIQ web app, the CareerIQ iOS companion, and the HR Admin employer console. A slide template is included for decks.

The files here are **design references**, not production code. Your job is to **recreate the designs in the target codebase's existing framework** (React/Next.js, Vue, SwiftUI, React Native, etc.) using its established patterns. If the project is a fresh codebase, pick the most appropriate framework and implement there.

---

## How to use this folder

1. **Read `README.md`** — brand voice, visual foundations, iconography rules, tone, copywriting patterns.
2. **Read `SKILL.md`** — condensed agent guide with the checklist of rules that cannot be broken.
3. **Copy `colors_and_type.css`** into the target codebase as the source of truth for tokens. Keep the variable names (`--fst-bg`, `--fst-accent`, `--fst-career`, etc.) — every UI kit references them.
4. **Copy `fonts/`** into the target codebase's assets directory. Wire them up with `@font-face` declarations (examples at the top of `colors_and_type.css`).
5. **Copy `assets/`** — logos, favicon, client logos, hero imagery.
6. **For each screen you're asked to build**, find the closest reference in `ui_kits/` and recreate it in the target framework. The JSX in these files uses plain React + inline styles for readability — translate to the codebase's conventions (Tailwind, CSS modules, styled-components, etc.), but keep the visual output identical.

### Surface → UI kit mapping
| If you're building… | Open this |
|---|---|
| Marketing page, landing, careers hero | `ui_kits/website/` |
| Participant web app (CareerIQ) | `ui_kits/webapp/` |
| iOS companion app | `ui_kits/ios/` |
| Employer / HR admin dashboard | `ui_kits/admin/` |
| Sales deck, webinar, client report | `slides/Template Deck.html` |

---

## Non-negotiable rules

These are the rules a senior reviewer will check first. Any violation is a bug.

### Voice & copy
- **Sentence case** for every headline, button, nav item, and modal title. Never Title Case. Never ALL CAPS except short eyebrow/kicker labels (≤ 3 words, tracked `0.08–0.14em`).
- **No emoji.** Anywhere. Ever.
- **No exclamation points** in copy — conviction comes from the period.
- **Em-dashes** (`—`, not `--` or `-`) for qualifiers: "Unlimited coaching — until placed."
- **Pair every big number with a qualifier**: `4.9` + `over 174 reviews`, never `4.9` alone.
- **Short, declarative sentences.** Editorial, almost essayistic — not SaaS marketing.

### Color
- Page default is `--fst-bg` (cream `#fcf9f5`). **Never pure white backgrounds** — `#ffffff` is reserved for `--fst-surface` (cards, modals).
- Marketing primary: `--fst-accent` (`#003147`, deep teal-navy).
- Product-only accent: `--fst-career` (`#46A1EC`). **Only** use in CareerIQ web app and iOS screens — never in marketing or admin.
- Dark surfaces: `--fst-bg-dark` (`#0f1729`). Used sparingly, for wealth-sibling or tension beats in decks.
- Semantic: `--fst-success` is moss green (`#6B8E4E`), not emerald. `--fst-warn` is `#FBBF24`. `--fst-danger` is `#DC2626`.

### Type
- **Playfair Display** (500–700, tight tracking `-0.02em`) for H1/H2/H3.
- **Bree Serif** (400) for secondary "friendly slab" titles — card headers, feature callouts.
- **Inter** (400/500/600) for body + UI chrome.
- **IBM Plex Mono** for numeric chips, eyebrows, agent pipeline labels.

### Layout & spacing
- 8-pt grid: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128.
- Max content width ~1200–1280px, centered.
- Marketing sections breathe at 96–128px vertical padding.
- Card radius: **16px** default. Button radius: 8px. Pill radius: 9999px.
- Border: **1px** only. Never 2px. Color: `--fst-border` (`#E5E2DB`).

### Interaction
- Button hover: darken ~4%. Active: translate-y +1px. **No scale, no lift, no bounce.**
- Card hover: `--fst-shadow-md` at 500ms `standard` easing. Scale ≤ 1.02 only.
- Links: transition `--fst-accent → --fst-career` at 0.3s. Underline stays.
- Focus ring: 3px `--fst-accent-muted` (accent at 12% alpha). Warm, never neon.

### Iconography
- **Lucide** (1.75px stroke) is the icon set. Substitute if you need something not in Lucide, but match the weight.
- **No illustrated icons**, no abstract SVG "waves", no gradients as decoration.
- Client logos in `assets/logos-clients/` are the only "branded iconography" used in marketing.

---

## Implementation checklist (copy into PR descriptions)

```
- [ ] colors_and_type.css tokens imported (or equivalent mapped)
- [ ] Fonts loaded: Playfair Display, Bree Serif, Inter, IBM Plex Mono
- [ ] Correct surface's UI kit consulted; closest component used as reference
- [ ] Sentence case on every headline, button, nav item
- [ ] No emoji, no exclamation points
- [ ] Big numbers paired with qualifiers
- [ ] Cream background (`--fst-bg`), warm border (`--fst-border`), 16px card radius
- [ ] Lucide icons (or matched-weight substitute)
- [ ] Correct accent color for surface: `--fst-accent` (marketing) vs `--fst-career` (product)
- [ ] Focus ring uses `--fst-accent-muted`, not browser default
- [ ] Hover states: darken/shadow only — no scale, no bounce
```

---

## How to translate HTML references

The UI kits use React with inline styles for portability. When you recreate:

- **Tailwind project** — map CSS variables to `theme.extend.colors` and `theme.extend.fontFamily` in `tailwind.config.js`. Translate inline styles to utility classes. Keep the variable names as the source of truth.
- **CSS modules / Vanilla Extract** — import `colors_and_type.css` as a global, reference `var(--fst-*)` throughout.
- **styled-components / Emotion** — wrap the tokens in a `ThemeProvider`. Component shapes mirror the JSX structure here.
- **SwiftUI (iOS)** — recreate the screens in `ui_kits/ios/` as `View` structs. Colors map to `Color` extensions; `Playfair Display` loads via `Font.custom`. The iOS kit already uses Apple HIG conventions (status bar, nav bar, liquid-glass pills, keyboard) — match them exactly.

**Do not ship the HTML files as-is.** They are design references — source of truth for *what it should look like*, not *what should be deployed*.

---

## Known gaps / ask the designer before inventing

- Program configurator for HR Admin (pricing tiers "Essentials / Extended / Enterprise").
- Interview-prep, salary-negotiation, LinkedIn-optimization, insights-dashboard flows named on the site but not wireframed.
- FirstSourceWealth (sibling brand) surfaces — dark-navy variant referenced in tokens but not built.
- Authoritative logo vector — the wordmark in `assets/logo-fst.svg` is a reconstruction. Swap if an official vector is available.
- Real product photography — only a handful of placeholders in `assets/images/`.

If you hit one of these, **ask** rather than invent. A placeholder comment is better than off-brand work.
