# CareerIQ iOS UI Kit

Three screens of the mobile companion app, shown in iOS 26 frames side-by-side.

- **Home** — greeting, live Resume Agent card (FST blue), applications in flight.
- **Job detail** — match explanation, resume draft status, network connection surfacing.
- **Coach chat** — 1:1 messaging with the dedicated strategist, plus a prep-brief attachment card.

## Foundations
- Cream scroll background (`#F5EFE6` — matches `--fst-bg`)
- Cards: slightly warmer cream (`#FBF7EF`), 1px dark-cream hairline, 14–18px corner radius
- Accent: `--fst-career` blue (`#1b4f8b`) for agent cards, primary buttons, interactive text
- Type: Playfair Display for screen titles, Bree Serif for card labels, SF for body/chrome
- Status dots for application state (blue=interview, olive=applied, rust=drafted, green=match)

## Usage
Open `index.html`. Frames are static mockups — use them as reference for screen composition or paste individual components into flows.
