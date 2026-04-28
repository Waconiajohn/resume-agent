# Handoff to Claude Code — Prompt Templates

Paste the right prompt into Claude Desktop (or directly into Claude Code) depending on what you need. Each one assumes the `design_system/` folder (what's zipped here) lives at the root of your repo.

---

## 🔧 One-time setup prompt (run this first)

```
I've added a `design_system/` folder to this repo. It's the canonical FirstSourceTeam design system — tokens, fonts, assets, and four UI kits (marketing site, CareerIQ web app, iOS companion, HR Admin console).

Please:
1. Read `design_system/CLAUDE.md` end to end — it's the contract for all UI work.
2. Read `design_system/README.md` for brand voice and visual foundations.
3. Wire `design_system/colors_and_type.css` into our build (import as a global, or translate the CSS variables into our theme config if we use Tailwind/styled-components/etc).
4. Copy the font files from `design_system/fonts/` to our assets directory and set up `@font-face` declarations.
5. Copy brand assets from `design_system/assets/` (logos, favicon, client logos, hero imagery).
6. Create or update our project root `CLAUDE.md` to reference `design_system/CLAUDE.md` as the source of truth for any UI work.
7. Report back what framework/styling approach this codebase uses, and how you mapped the tokens.

Do not change any product logic. This pass is wiring only.
```

---

## 🎨 Unify an inconsistent codebase

```
Our app has grown inconsistent — multiple color schemes, typography choices, and button styles. The canonical design system is in `design_system/`.

Please:
1. Read `design_system/CLAUDE.md`.
2. Audit the codebase and produce a report in `design_system/audit.md` that lists:
   - Every color used in the codebase vs. the tokens in `colors_and_type.css`.
   - Every font family used vs. the approved four (Playfair Display, Bree Serif, Inter, IBM Plex Mono).
   - Every custom button component and how it differs from the reference in `ui_kits/website/` or `ui_kits/webapp/`.
   - Any ALL CAPS headlines, Title Case headlines, or emoji — all of which must go.
3. Propose a migration plan (not an execution yet): which screens to unify first, what the blast radius of token substitution would be, and any ambiguous cases that need design review.

Do not make code changes yet. I want to review the audit first.
```

---

## 🏗 Build a new feature from the design system

```
Build [FEATURE NAME] for the [marketing site / participant web app / iOS app / HR admin console].

Source of truth: `design_system/CLAUDE.md` — read it first.
Closest reference: `design_system/ui_kits/[website|webapp|ios|admin]/` — start from the components there.

Requirements:
- [Describe what the feature does in 2-4 bullets]
- [List user actions / data shown]

Constraints:
- Sentence case everywhere; no emoji; em-dashes for qualifiers.
- Use existing tokens from `colors_and_type.css` only — do not introduce new colors, fonts, or radii without asking.
- Accent color: `--fst-accent` for marketing surfaces, `--fst-career` for product surfaces.
- Follow the implementation checklist at the bottom of `design_system/CLAUDE.md` — include a filled-out copy in the PR description.

Ask if anything is ambiguous. Do not invent layouts for flows not shown in the UI kits — confirm with me first.
```

---

## 📐 Recreate a specific screen pixel-perfect

```
Recreate the screen at `design_system/ui_kits/[kit]/index.html` (specifically the [component/section name] section) in our codebase.

This is a hi-fi design — the intent is pixel-perfect. Match:
- Exact colors (use the CSS variables, not hard-coded hex).
- Typography (font, size, weight, line-height, letter-spacing).
- Spacing (padding, margins, gaps).
- Border radius, shadow, border color.
- Hover, active, and focus states.

Translate the inline-styles JSX into our codebase's conventions (e.g., Tailwind classes, CSS modules). Do not ship the HTML file itself.

Before you start, tell me which file(s) you intend to create or modify.
```

---

## 🧩 Add a new component to the system

```
We need a new [component name] component. It doesn't exist in any of the UI kits yet.

Before building it:
1. Read `design_system/CLAUDE.md` and `design_system/README.md`.
2. Propose 2-3 variations as small HTML sketches in `design_system/proposals/[component].html` — showing how it could look following the existing visual language.
3. Wait for me to pick one.

After I pick:
4. Add the chosen variant to the appropriate `ui_kits/[kit]/` folder.
5. Create a preview card in `design_system/preview/components-[name].html` so it shows up in the review pane.
6. Implement it in the app codebase.
```

---

## 🪄 Quick style guide for any prompt

When you're asking for UI work anywhere, add this footer to your prompt:

```
Follow `design_system/CLAUDE.md`. Sentence case, no emoji, Playfair/Bree/Inter/Plex Mono only, cream background, 16px card radius, 1px `--fst-border`, Lucide icons. Ask if anything is ambiguous.
```
