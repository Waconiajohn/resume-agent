# FST Slide Template

A seven-slide 16:9 (1920×1080) template covering the shapes FST decks need most:

1. **Title** — cream, Playfair headline, mono eyebrow, subtitle in Playfair italic-weight.
2. **Proof** — three big-number stats with denominators, MONO eyebrow + labels.
3. **Problem** — dark navy variant, for the "outplacement was broken" beat.
4. **Comparison** — side-by-side competitor vs. us, 1.7/5 vs. 4.9/5.
5. **Pillars** — 3-up feature cards on cream, Bree Serif heads.
6. **Quote** — full-slide pull-quote with participant attribution.
7. **Close** — dark, call-to-action with contact line in the footer.

## Layout rules
- **Base 120px horizontal padding, 96px vertical** — editorial margins.
- Mono eyebrow label (≤ 3 words) at top of every slide.
- Mono footer: left = slide intent, right = slide number.
- One Playfair H1 or blockquote per slide max. Body never smaller than 22px.
- Never a gradient, never a shadow on the slide itself — the cream canvas carries.

## Dark variant
Apply `class="dark"` on `<section>` to flip to `--fst-bg-dark` (`#0f1729`). Reserved for tension beats (the problem, or a dramatic close) — don't overuse, 2 max per deck.

## Rendering
Open `Template Deck.html`. Uses `<deck-stage>` for keyboard nav, print-to-PDF, and persistence. Press `R` to reset, number keys to jump.
