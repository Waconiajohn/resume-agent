# Marketing Website UI Kit

Recreates the look and feel of firstsourceteam.com/careers as a modular React kit.

## Components
- `<Nav/>` — sticky top nav, Playfair wordmark, right-aligned menu + "Talk to Our Team →"
- `<Hero/>` — eyebrow + Playfair display headline + lead paragraph + CTA pair + 3-up stats + portrait with floating "Dedicated coach" card
- `<LogoCloud/>` — 8 client logos on warm-alt band with eyebrow label
- `<Bento/>` — 3-col / 2-row bento grid: CareerIQ agent pipeline (tall), coaching session + remote cards (stacked), full-bleed satellite dark panel
- `<AgentPipeline/>` — the mono-styled pipeline rows inside the bento
- `<Quote/>` — Playfair italic editorial quote with inline color callouts
- `<Features/>` — 6-up grid of lettered feature titles in Bree Serif + body
- `<CTA/>` — two-up "For Individuals" / "For Employers" closing card pair
- `<Footer/>` — logo + address + 3 link columns + copyright

## Usage
Import `Components.jsx` after React + Babel in a page that also imports `colors_and_type.css`. See `index.html`.

## Known gaps
- Lucide icons are hinted but not wired (no icons visible on the live site either — kept intentionally sparse)
- Testimonial marquee rail is omitted for space; the quote block covers the pattern
- Wealth (dark) variant stubbed only in the satellite bento panel
