# HR Admin Console UI Kit

Employer-facing surface for buyers (HR + legal + finance). Separate from the participant app because the audiences have very different needs: the participant app is motivational and warm; the admin console is data-dense, compliance-minded, and neutral.

## Decisions
- **Dark slate sidebar** (`#1f2937`) to distinguish from the participant surface. All other chrome is on the standard cream.
- **Tiny FST mark** on the sidebar (cream square with Playfair "F") — the Employer Console is explicitly co-branded.
- **Evernote Co.** shown as the example customer (matches the mock participant "Mike S. · VP Engineering" used throughout).
- **Donut KPIs** instead of bar charts for at-a-glance engagement — 3 metrics, each ≤ 100%, the form fits.
- Status colors map to the **participant lifecycle**: blue=networking/interview, green=offer/success, gold=drafting, rust=applying, muted=declined.

## Components
- `<SideNav/>` — dark slate rail with org context card at bottom
- `<KPI/>` — four metric tiles on the cream
- `<EngagementCard/>` — three donuts + a highlight callout
- `<BillingCard/>` — "Positive Decline Refunds" featured in billing math
- `<ParticipantTable/>` — filterable participant list with stage dots
- `<Donut/>` — inline SVG percentage ring, re-usable

## Known gaps
- Program configurator (mentioned on site: "Essentials / Extended / Enterprise or build your own") not drawn.
- Audit log detail view is a button target only.
- No compliance/legal tab interior.
