# CareerIQ color audit — v3 polish, step 2a

**Date:** 2026-04-20
**Scope:** `app/src/` color tokens and usage
**Status:** Audit only. **No color variable has been modified.** Awaiting a direction call from John before Step 2b.

---

## Executive summary — what's happening

The app has a well-structured token system (single source in `app/src/index.css`, shared token names between light and dark). The structure is good. The problem is the palette choices those tokens resolve to.

Three distinct color "voices" are in use simultaneously on the resume-builder screen, and none of them share a hue family:

| Voice | Token family | Dark mode | Light mode | Where it shows up |
|---|---|---|---|---|
| v3 coral accent | `--bullet-confirm*` | `#fdba74` (peach) | `#ea580c` (burnt orange) | Stage dots, active-card border, "Apply" chip, strategy "primary" badge, success check in Review panel |
| Primary blue | `--accent-strong`, `--link`, `--btn-primary-*`, `--badge-blue-*` | `#afc4ff` / blue-600 fill | `#2563eb` | "Generate tailored resume" button, "AI rewrite" chip on bullets, "Apply" verify chip hover, strategy "secondary" badge |
| Semantic greens/ambers/reds | `--badge-green-*`, `--badge-amber-*`, `--badge-red-*` | pastels (see below) | `#16a34a` / `#b45309` / `#dc2626` | Strategy strong-match chip (green), gap severity (amber "manageable" / red "disqualifying"), verify error/warning rows, bullet confidence bars |

Add to that the amber used in light mode (`#b45309`) which reads as a brown, plus the purple used in badges (`#7c3aed`), and a single v3 results screen can simultaneously show coral + blue + green + brown-amber + red on top of the gray surface chrome. That is the clash John called out: "coral alongside greens and browns that don't belong together."

The core failure mode is not that any single color is wrong — it is that **there is no hue discipline**. Coral anchors v3-specific UI. Blue anchors primary actions and inbound links. Green anchors positive validation. Amber anchors warnings. These four accent families come from four different design decisions made at four different times, and none of them were subsequently reconciled.

---

## 1. Token system — where colors live

### File

`app/src/index.css`, a single `@layer base` block (lines 1–233) defining:

- `:root:not([data-theme='light']), :root[data-theme='dark']` — dark theme defaults
- `:root[data-theme='light']` — light theme override

Both blocks define **the exact same variable names**. Same surface area, different values. This is a clean structure: light and dark are not independent palettes; they are two renderings of a shared token namespace. The only tailwind extension (`tailwind.config.ts`) is a small `colors.surface.*` block used inconsistently — most surfaces route through the CSS variables directly via `bg-[var(--surface-n)]`.

### Token families (shared names, per-theme values)

| Family | Tokens | Purpose |
|---|---|---|
| Background layers | `--bg-0` … `--bg-3` | App chrome, from deepest base to highest raised surface |
| Glass surfaces | `--surface-0` … `--surface-3`, `--surface-elevated` | Card bodies, panels; translucent rgba so body gradient bleeds through |
| Lines | `--line-soft`, `--line-strong` | Borders, dividers |
| Text | `--text-strong`, `--text-muted`, `--text-soft` | Three-rung type color scale |
| Brand accent | `--accent`, `--accent-strong`, `--accent-ink`, `--accent-muted` | Primary action surface (button fill, focus ring base) |
| Link / primary action | `--link`, `--link-hover`, `--btn-primary-bg`/`-border`/`-hover`/`-text` | Primary buttons, links — **blue in both modes** |
| Semantic badges (5) | `--badge-{blue,green,amber,red,purple}-{bg,text}` | Status chips, notifications |
| Bullet coaching | `--bullet-{strengthen,confirm,code-red,supported}` plus `-bg` and `-border` | Resume v2 bullet editor (confirm = approved, strengthen = needs work, code-red = fabrication risk) |
| Misc chrome | `--sidebar-*`, `--header-bg`, `--mobile-menu-bg`, `--grid-line-*`, `--shadow-low`/`-mid`, `--body-grad-*`, etc. | 30+ scoped tokens for specific layout zones |

### Structural tokens (not per-theme)

`--radius-card` (18px), `--radius-control` (12px), `--radius-tight` (10px), `--font-body`, `--font-display`. Defined on `:root` once; both themes inherit.

---

## 2. Usage counts — how often each token is referenced

Counts below are rough — `grep -rho "--<token>"` across `.ts`/`.tsx`/`.css` under `app/src/`, including both CSS definitions and component consumers. Use as relative signal.

| Token family | Usages | Footprint |
|---|---|---|
| `--text-soft` | 2,133 | Dominant secondary/tertiary text |
| `--link` (blue) | 1,201 | Pervasive — the de facto primary accent |
| `--badge-green-*` | 807 | Very high — positive-confirmation |
| `--text-strong` | 765 | Primary copy |
| `--text-muted` | 745 | Middle copy |
| `--accent`, `--accent-strong`, `--accent-muted` | 715 | Button fills, focus-ring base |
| `--badge-amber-*` | 538 | Warnings, middle-tier indicators (reads brown in light mode) |
| `--badge-red-*` | 533 | Errors, alerts, destructive action |
| `--badge-blue-*` | 157 | Secondary blue accent (distinct from `--link`) |
| `--bullet-confirm` (coral) | 82 | v3 accent, plus v2 bullet-coaching "approved" state |
| `--surface-0`, `--bg-0` | 36 + 21 | Backgrounds |
| `--btn-primary-*` | 26 | Primary-button utility (mostly GlassButton) |
| `--badge-purple-*` | 14 | Rarely used — a few badges |
| `--bullet-strengthen` | 8 | v2 bullet-coaching only |
| `--bullet-code-red` | 8 | v2 bullet-coaching only |
| `--bullet-supported` | 2 | Alias of green |

### Tailwind raw color utilities (tokens **bypassed**)

Scanning for `bg-gray-500`, `text-red-400`, etc. — these are off-token and contribute to the inconsistency because they don't shift with theme:

| Class | Uses |
|---|---|
| `text-gray-800` | 35 |
| `text-red-400` | 22 |
| `text-gray-500` | 20 |
| `text-gray-700` | 18 |
| `text-gray-400` | 18 |
| `bg-blue-50` | 17 |
| `border-gray-300` | 15 |
| `text-gray-900` | 9 |
| `text-amber-400` | 9 |
| `bg-red-400` | 9 |
| (tail) | ~100 more across slate/emerald/amber/blue |

Total: ~300+ raw-color utilities across `app/src/components/**`. This is a real but bounded mess; it's the long tail, not the headline problem.

### Hardcoded hex colors in components (tokens **double-bypassed**)

20 instances of `#b5dec2` (pastel green), 17 of `#f0a0a0` (salmon), 14 of `#f0d99f` (pale amber), 11 of `#f0a9a9` (pink), 8 of `#afc4ff` (periwinkle), 6 of `#4ade80` (bright green), plus a scatter of others. Roughly 100 hex literals total across all component files. These are almost entirely **SVG fill/stroke colors for chart and report components** (`scoring-report/`, `job-command-center/`), NOT panel chrome — so they don't affect the resume-builder view but do show up in analytics views.

---

## 3. Light vs dark — are they independent or shared?

**Shared token names, independent palette values.** The dark block uses pastels on a near-black base; the light block uses saturated hues on near-white. No token is a computed derivative of another — every value is hand-picked per mode.

Selected side-by-side so the shift is visible:

| Token | Dark | Light |
|---|---|---|
| `--bg-0` | `#080b10` | `#f8f9fb` |
| `--text-strong` | `rgba(245, 247, 250, 0.97)` | `rgba(15, 23, 42, 0.95)` |
| `--accent-strong` | `#eef3f8` (off-white) | `#2563eb` (blue-600) |
| `--link` | `#afc4ff` (periwinkle) | `#2563eb` (blue-600) |
| `--bullet-confirm` | `#fdba74` (peach-orange) | `#ea580c` (burnt orange) |
| `--badge-green-text` | `rgba(181, 222, 194, 0.8)` | `#16a34a` |
| `--badge-amber-text` | `rgba(240, 217, 159, 0.8)` | `#b45309` (brown) |
| `--badge-red-text` | `rgba(240, 184, 184, 0.8)` | `#dc2626` |

**Implication**: the two modes feel like distinct designs. In dark mode, all semantic colors are muted pastel rgba values — they blend together and lower contrast, so the clash reads as "dusty." In light mode, they are full-saturation hexes — the green is vivid, the amber is unmistakably brown, the coral is bright orange. The clash is much louder in light mode because each hue is at full chroma against a near-white field.

This asymmetry also explains why John first noticed the problem: he likely saw the light-mode version with its unrestrained color conflict more acutely.

### Bug surfaced during the audit (not a color choice — a rendering bug)

In `V3StageProgress.tsx` (shipped by Step 1), the "why this matters" paragraph uses `text-[var(--text-strong)]/90`. The token resolves to an rgba() already; Tailwind's `/90` opacity modifier does **not compose cleanly with rgba** and silently falls back to `rgba(255,255,255,0.9)`. In dark mode that's fine (near-white text on dark background). In light mode it renders the paragraph text white-on-white — invisible. Confirmed by inspecting computed style; see screenshot at `light-mode-complete.png`.

Nine other instances of `var(--text-*)]/<n>` or `var(--line-*)]/<n>` exist elsewhere in the app and have the same latent bug; they have been historically tolerated because most of them sit in dark-mode-first components. **Fix is one-line (drop the `/90`), but it touches a color-system concern, so it should ship alongside the palette work in Step 2b.**

---

## 4. The actual visible clash — documented

The user-read complaint was about the resume-builder screen in both modes. Here's where you can see the collision specifically:

### On `V3StrategyPanel.tsx` (left panel during a run)

```
// Position weight chips:
'primary'   → bg-[var(--bullet-confirm-bg)] text-[var(--bullet-confirm)]  // coral
'secondary' → bg-[var(--badge-blue-bg)]     text-[var(--badge-blue-text)] // blue
'brief'     → (no color)

// Gap severity chips (same panel, inches away from the above):
'disqualifying' → bg-[var(--badge-red-bg)]   text-[var(--badge-red-text)]   // red
'manageable'    → bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)] // brown in light mode

// Strong-match strength indicator (same panel, same card row):
'strong' → bg-[var(--badge-green-bg)] text-[var(--badge-green-text)] // green
```

A single Strategy card can therefore display **coral + blue + red + brown + green at once** (a primary-weighted position with a disqualifying gap and a manageable gap and a strong direct match). That's five accent hues on one card.

### On `V3VerifyPanel.tsx` (right panel during a run)

```
// Severity icons:
error   → AlertTriangle, text-[var(--badge-red-text)]    // red
warning → AlertCircle,   text-[var(--badge-amber-text)]  // amber/brown
passed  → CheckCircle2,  text-[var(--bullet-confirm)]    // coral

// Action chips within a single issue row:
"Apply"      → text-[var(--bullet-confirm)] hover:bg-[var(--bullet-confirm-bg)]  // coral
"AI rewrite" → text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]     // blue
"Address"    → text-[var(--badge-blue-text)] hover:bg-[var(--badge-blue-bg)]     // blue
"Dismiss"    → text-[var(--text-soft)]                                           // gray
```

"Apply" is coral but "AI rewrite" — a conceptually-adjacent AI action — is blue. That's the inconsistency without a principle behind it.

### On `V3ResumeView.tsx` (middle panel during a run)

```
"AI" badge on every rewritten bullet → hover:text-[var(--badge-blue-text)]  // blue
Revert icon                          → text-[var(--badge-red-text)]         // red
Source-chip (if is_new=true)         → hover:text-[var(--bullet-confirm)]   // coral
Confidence quietly encoded as a left border:
   >=0.7 (high)    → (none)
   0.4–0.7 (med)   → border-[var(--badge-amber-text)] // amber
   <0.4 (low)      → border-[var(--badge-red-text)]   // red
Summary error hint → border-[var(--badge-red-text)]
```

Same row of a bullet: blue "AI" badge + coral source-chip hover + amber confidence stripe. Three hues per row on every rewritten bullet.

### Stage progress (from Step 1)

The six stage cards are entirely coral-accented (active card coral bg + coral border). That works **in isolation** — it reads as one consistent palette for pipeline chrome. The problem only appears when the panels below mix coral with blue/green/amber as described above.

---

## 5. Why this happened (historical cause)

Reading the token definitions, the likely sequence:

1. The v1/v2 app started with a blue-dominant palette — `--accent`, `--link`, `--btn-primary-*`, `--accent-strong` all resolve to blue in light mode. The semantic badges (green/amber/red) were added to mark confidence, gaps, and errors in resume-v2 coaching.
2. `--bullet-confirm` was introduced as a coral to mark "approved bullet" distinctly from green (which was already in use for "supported"). In v2 this was a small accent — 8 uses.
3. When v3 was built, the coral token was reused as the primary v3 accent for pipeline chrome. Usage of `--bullet-confirm` ballooned from ~8 to 82, but the rest of the app stayed blue-primary.
4. Nothing retired or reassigned the older tokens. Both color systems now live in parallel: blue for "app primary action," coral for "v3 specifically."

This is classic token-system drift. The fix is not more tokens but a deliberate decision about which voice is the brand and which fall in line behind it.

---

## 6. Recommended direction — three options

### Option A — **Warm-led palette (coral-forward, single accent)**

**What it would mean:**
- Coral becomes the single accent across the app. `--accent`, `--accent-strong`, `--link`, `--btn-primary-*` all unify to the coral family (using the same two-shade palette as `--bullet-confirm`, tuned per mode).
- Semantic badges soften to tonal variations: green becomes a muted sage; amber becomes a softer yellow-beige (not brown); red stays but tuned to sit alongside coral rather than fight it.
- Blue is retired as a brand color. Blue survives only where it is intrinsic to an asset (e.g. LinkedIn-branded chrome) — not as an app accent.

**Trade-offs:**
- Pro: v3 becomes the visual center of gravity, matching its position as the flagship product. Pipeline chrome, primary buttons, links all feel like one system. Strong identity.
- Pro: Warm palette is distinctive. Most resume tools use blue or teal; coral is memorable.
- Con: Requires retuning **every** primary-button, link, focus-ring, and inbound blue accent across `app/src/`. Real code churn — ~1,500 references touched.
- Con: Coral at executive-resume scale can read "consumer app" if not handled carefully. Needs a mature, muted warm (think Notion or Linear's warm-accent work, not peach-bright).

### Option B — **Earth-led palette (muted, green/neutral foundation)**

**What it would mean:**
- Warm the entire palette into a neutral-earth direction: surface colors shift to warm-grays (not cool slates), amber becomes a clay that reads as earth not brown, green softens to sage, coral is retired in favor of a terracotta that lives in the same family as the earth tones.
- Blue is retired or kept only for links.
- Palette feels like a professional services firm — premium, quiet, a little bit editorial.

**Trade-offs:**
- Pro: Harmonious by construction — every hue is a variation of the same earth family.
- Pro: Reads "grown-up" and aligns well with the 55+ executive audience stated in `tailwind.config.ts` comments.
- Con: Big visual shift. The app today has a cool-blue default; going warm-earth is a new brand direction, not a tidy-up. May require stakeholder sign-off beyond a polish task.
- Con: The v3 coral work and the pipeline chrome would all need to be reworked. Step 1's persistent-reveal cards are coral-accented; they'd shift to terracotta under this option.

### Option C — **Restrained neutral + single accent (recommended default)**

**What it would mean:**
- Neutrals (text, surfaces, lines) become the primary visual. One accent color is chosen for all primary action, focus rings, and positive "active" states.
- Pick **one accent**: either coral (if we want v3's identity to win) or a premium neutral-blue (if we want to anchor in the existing primary-button system). Retire the other.
- Semantic colors become tonal, not vivid: green/amber/red exist only as small semantic signals (badge bg/text pair at ~10% saturation) and never as primary UI chrome.
- Strategy-panel chip colors get rationalized: weight is not coded by hue ("primary"/"secondary"/"brief"); it's coded by weight of the chip itself (filled / outlined / ghost). Severity stays in green/amber/red but at low saturation.

**Trade-offs:**
- Pro: Easiest to ship cleanly. Highest cohesion for lowest scope. Most editorial / executive-appropriate.
- Pro: Reduces total accent usage by ~60–70% (no more color-for-information-encoding when weight would do).
- Pro: Sets the foundation for future palette work without locking us into warm or cool.
- Con: Less visually distinctive. Won't stand out in a screenshot the way coral-led would.
- Con: Requires a principled call on WHICH single accent survives (coral vs. blue). That's the call John needs to make.

**Within Option C, the sub-choice is the accent:**
- **C1 — coral survives** (retire blue as primary; keep v3's voice; retrain primary buttons to coral).
- **C2 — blue survives** (retire coral; v3 accents shift to blue; blue-dominant app becomes fully blue-dominant).

C1 preserves Step 1's visual identity. C2 is a smaller diff because blue has more existing usage.

---

## 7. What I'd recommend if pressed

**Option C1: restrained neutral with coral as the single accent.**

Reasoning:
1. v3 is the flagship. It is the product users pay $49/mo for. Its visual identity should win.
2. Step 1 (persistent-reveal) already uses coral as the v3 voice and it lands well.
3. Blue-as-primary is inherited from pre-v3 chrome and has no brand story behind it — it's "whatever Tailwind shipped default." Retiring it costs nothing in identity.
4. Retaining semantic green/amber/red but **flattening their saturation** addresses the "brown and green alongside coral" complaint directly: green and amber stop fighting for attention. They become quiet indicators, not competing accents.
5. Rationalizing the Strategy-panel weight chips to use chip weight instead of hue removes an entire source of hue-stacking.

**Estimated implementation scope for C1:**
- `index.css`: retune ~20 tokens (light + dark = ~40 values). One focused edit.
- `app/src/components/`: replace `--link`, `--accent-strong`, `--btn-primary-*` consumers with the unified coral tokens. Most done via variable change (no component edits); a handful of components hardcode `blue-*` Tailwind utilities and need manual substitution (~30–40 component touches).
- `V3StrategyPanel.tsx`: rework the `primary`/`secondary`/`brief` weight chip styling to not rely on hue.
- Fix the `text-[var(--text-strong)]/90` rgba-opacity bug surfaced in §3 (touches ~10 sites, ships in the same commit).

Half-day of focused work. No schema or data changes.

**Rough visual demonstration** — see `light-mode-complete.png` for the current light-mode state mid-problem (note the invisible paragraphs, a color-system bug in its own right) and `persistent-reveal-midrun.png` for the current dark-mode state. Both show the coral-dominant chrome; neither shows the multi-hue clash yet because the run hadn't produced review issues. If John wants a "clash" screenshot, a fixture with known verify errors (e.g. joel-hough from the UX test) would surface red+amber+coral+blue on one Strategy card.

---

## 8. What I need from John

**A direction call, specifically:**
1. Warm-led (Option A), earth-led (Option B), or restrained-with-single-accent (Option C)?
2. If Option C: C1 (coral survives) or C2 (blue survives)?
3. Any existing brand constraints I should know about? (Marketing site, pitch deck, pricing page are all coral-accented today — that suggests C1 is already consistent with upstream brand choices, but confirm.)

**Do not touch any color variable until John approves the direction.**

---

## 9. Artifacts

- `light-mode-complete.png` — current light-mode view of the pipeline complete state. Also shows the paragraph-invisible rgba-opacity bug.
- `persistent-reveal-midrun.png` — current dark-mode view mid-run (from Step 1).
- This document.
