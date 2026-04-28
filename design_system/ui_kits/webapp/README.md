# CareerIQ Web App UI Kit

Product surface for the AI-powered job-search platform referenced throughout FST marketing. Cooler than the marketing site — same cream background, but card-dense, with the `--fst-career` blue as the product accent.

## Components
- `<Sidebar/>` — left nav with CareerIQ wordmark block, 6 nav items, user chip at the bottom
- `<TopBar/>` — date eyebrow + Playfair H1 + search field + primary action
- `<StatTile/>` — four-up metric tiles (applications, interviews, response rate, streak)
- `<AgentCard/>` — the Resume Agent Pipeline from the marketing bento, but interactive + auto-advancing
- `<CoachCard/>` — dedicated-coach module with next-session CTA
- `<JobsTable/>` — "Applications in flight" table with colored status dots
- `<Icon/>` — inline Lucide-style 1.75px stroke SVGs

## Usage
Open `index.html`. The sidebar is static nav; the agent pipeline auto-advances every ~2s to show the live motion.

## Known gaps
- Interview prep, salary negotiation, LinkedIn optimization views aren't wireframed — the methodology section of the site lists them but provides no screens.
- Messages/Insights tabs are stubs.
- No real charting in the Insights tile.
