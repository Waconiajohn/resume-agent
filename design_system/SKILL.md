---
name: firstsourceteam-design-system
description: Design system for FirstSourceTeam (FST) — a career transition and executive outplacement firm. Covers the marketing website, the CareerIQ web app, the CareerIQ iOS companion, the HR Admin employer console, and slide templates. Use whenever a user asks for FST, FirstSourceTeam, CareerIQ, or FirstSourceWealth designs.
---

# FirstSourceTeam Design System — Usage Guide

FST is a Minneapolis outplacement firm with a sharp editorial voice and a warm-cream visual identity. This system covers four product surfaces; each has its own UI kit folder.

## Before you design
1. Read `README.md` top-to-bottom — it contains the voice guide, visual foundations, and iconography rules.
2. Import `colors_and_type.css` into any HTML you write. It declares every CSS variable, loads the `fonts/`, and sets element defaults (h1–h3, body, eyebrow, quote, etc.).
3. Identify which surface you're designing for:
   - **Marketing site** → `ui_kits/website/` — warm, editorial, long scrolls, bento grids.
   - **Web app (CareerIQ)** → `ui_kits/webapp/` — product-blue accent, sidebar shell, data-dense.
   - **iOS companion** → `ui_kits/ios/` — iOS 26 liquid-glass frames on cream bg, Playfair titles.
   - **HR Admin (employer console)** → `ui_kits/admin/` — dark slate sidebar, donut KPIs, audit-ready.
   - **Slides** → `slides/` — 16:9 editorial template in Playfair + Bree Serif.

Copy from the closest existing component in the right kit rather than starting from scratch. Every kit has a `README.md` with specifics.

## Type system at a glance
- **Playfair Display** (500–700, tight tracking) for headlines.
- **Bree Serif** (400) for secondary/"friendly slab" titles — card headers, feature callouts.
- **Inter** (400/500/600) for body + UI chrome.
- **IBM Plex Mono** for numeric chips and agent pipeline labels.

## Color system at a glance
- Cream `--fst-bg` (`#fcf9f5`) is the page default — never pure white.
- Deep teal-navy `--fst-accent` (`#003147`) for marketing primary — links and primary buttons.
- Product blue `--fst-career` (`#46A1EC`) is **only** for the CareerIQ web app and iOS surfaces.
- Warm black `--fst-heading` (`#111110`) for headlines; warm ink `--fst-text` (`#1f292e`) for body.
- Preview cards in `preview/colors-*.html` show the full palette in use.

## Voice rules (cannot compromise)
- **Sentence case** for every headline, button, and nav item. Never Title Case.
- **No emoji.** Not in UI, not in marketing, not in slides.
- **Em-dashes** for qualifiers. Short declarative sentences. Name enemies when the copy calls for it.
- Pair every big number with a qualifier: `4.9` + `over 174 reviews`, not `4.9` alone.
- Body copy should sound like an editorial, not a product page.

## Iconography
- **Lucide** (1.75px stroke) is the substitute icon set — referenced by all web/app kits.
- **Client logos** in `assets/logos-clients/` are the only "branded iconography" used in marketing.
- **FST wordmark** is in `assets/logo-fst.svg`; favicon at `assets/favicon.png`. Both are reconstructions; swap if the user provides authoritative vectors.
- No emoji, no illustrated icons, no abstract SVG "waves" or gradients.

## When you need something that isn't here
Ask the user first. Likely gaps:
- Authoritative brand vectors (logo, favicon).
- Real photography — only a handful of Unsplash-style placeholders ship here.
- Interview-prep, negotiation, LinkedIn optimization, insights dashboards are listed in marketing but not yet wireframed.
- Program configurator for the admin console is a known gap.
- Wealth (FirstSourceWealth) surfaces — referenced but not scoped.

## Checklist for a new design
- [ ] `colors_and_type.css` imported
- [ ] Correct surface's UI kit consulted and components lifted from
- [ ] Sentence case everywhere
- [ ] No emoji
- [ ] Big numbers paired with denominators/qualifiers
- [ ] Cream background, `--fst-border` hairlines, `16px` card radius
- [ ] Lucide icons (if any)
- [ ] Accent color = marketing (`--fst-accent`) OR product (`--fst-career`) depending on surface
