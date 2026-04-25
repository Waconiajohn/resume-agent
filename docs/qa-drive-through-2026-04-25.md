# Resume-Agent Drive-Through QA — 2026-04-25

Persona: 52-year-old VP of Operations who was recently laid off.

Scope: first-time workspace use, profile setup, applications, resume tailoring, cover letter, networking, interview prep, thank-you notes, follow-up, LinkedIn profile, timeline, and mobile scan.

## Blockers

| Status | Finding | User impact |
| --- | --- | --- |
| Fixed | Applications > Today > New application switched views but lost the form state. | A user trying to add their first target from Today could not create an application. |
| Fixed | Resume Builder Tailor picker failed to create an application because it submitted `source: tailor_picker`, which current DB constraints may reject. | A user starting from Resume Builder hit "Failed to create application" before tailoring. |
| Fixed | Resume V3 failed at strategize on a realistic operations resume/JD because `multi-site` vs `multi site` attribution was treated as unsupported. | A user could not complete a tailored resume. |
| Fixed | "I applied" on the cover-letter completion surface did not visibly change state when the append-only events route failed. | A user could click a primary milestone action and nothing happened. |
| Fixed | Timeline/What's Next could mark resume done after failed resume sessions, and could miss completed cover-letter sessions. | The workspace told users to do work they had already completed, or credited failed work as done. |
| Fixed | Interview Prep, Thank-You Note, and Follow-Up Email activation screens could be dead ends when backend toggle persistence failed. | A user could not enter the tool they explicitly activated. |
| Fixed | Interview activation did not survive reload in the live environment when PATCH failed. | A user could activate a tool, refresh, and get sent back to the activation wall. |
| Fixed | Schedule interview failed when the application events POST failed. | A user could not put a fake/upcoming interview on the application timeline. |
| Fixed | Locally scheduled interview events did not appear on the timeline when the server event ledger failed. | A user could schedule an interview and still not see it in the pursuit overview. |
| Fixed | LinkedIn Profile Editor finalized after the headline instead of walking through all profile sections. | A user expecting rewritten headline/about/experience/skills/education only got one section. |
| Fixed | Smart Referrals job scan exposed 7-day/city/radius filters in the UI, but radius was not sent to the server and location matching used unsafe substring logic. | A user filtering for a city/radius could see unrelated results or believe a radius search was active when it was not. |
| Fixed | LinkedIn content prompts contradicted themselves: one layer asked for 800-1,200 words while another enforced a 1,000-1,300 character target. | Generated posts could be overlong, then trimmed mechanically, producing unstable or chopped writing. |
| Fixed | Carousel generation converted paragraphs into dense slide copy. | A user expecting swipeable carousel slides could get text-heavy slides that feel like paragraphs pasted into a deck. |
| Fixed | LinkedIn Profile Editor education guidance asked for graduation years. | A 45+ executive could accidentally add an age-bias signal that does not improve marketability. |
| Fixed | Content-calendar/blog-like writing rules allowed broad 150-300 word output instead of the intended 250-word product contract. | Short drafts could feel underdeveloped, while longer drafts could drift toward full articles. |

## Polish Backlog

| Finding | User impact |
| --- | --- |
| Profile setup "Go to Workspace" initially showed stale 0% / Start Career Assessment until reload. | Mild trust hit after completing onboarding. |
| Mobile profile interview sometimes left the next question partially offscreen. | Small mobile ergonomics issue. |
| Activation fallback is local when backend PATCH is unavailable. | Good launch resilience, but should be replaced by confirmed DB migrations/server persistence before multi-device expectations. |
| Local event fallback keeps schedule/happened actions usable when `application_events` fails. | Good launch resilience, but server event persistence should be treated as the source of truth once migrations are confirmed. |

## Writing And Job-Board Validation

| Area | Result |
| --- | --- |
| LinkedIn Profile Editor | Functionally covered by tests. Rules now include the shared evidence/editorial standard and avoid graduation-year age signals. Qualitative read: strong section-by-section workflow; remaining polish is making the About length feel less bulky for executives who want a sharper profile. |
| LinkedIn content / article-style posts | Functionally covered by tests. Corrected the contradictory long-post prompt. Content calendar now targets about 250 words, with a 200-275 preferred range and a hard 300-word ceiling. |
| Carousel creator | Exists inside LinkedIn content generation, not as a standalone top-level creator. Builder now produces sparse presentation microcopy: short headlines, at most 1-2 micro-bullets, and tested slide word limits. |
| Blog creator | No standalone blog creator surface was found in the product. The closest current surface is content calendar / LinkedIn article-style drafting. Treat a real blog creator as backlog unless launch requires it. |
| Cover letters | Prompt/rule review is strong: evidence-bound, company-specific, executive-tone aware, and now aligned with the broader editorial-effectiveness layer. No blocker found in targeted tests. |
| Thank-you notes | Strongest communication product in the current set: role-calibrated recipient logic, multi-recipient uniqueness checks, timing warnings, and format-specific word limits. No blocker found in targeted tests. |
| Follow-up letters | Good sequence discipline: first nudge, second nudge, breakup/value-add are distinct; bans desperate phrases and vague check-ins. No blocker found in targeted tests. |
| Job Command Center board | Targeted job-search route/core/UI tests pass. No blocker found in this pass. |
| Smart Referrals / connection-aware job board | Fixed the 7-day/location/radius regression path and browser-smoked the filter UI on localhost. Did not launch a live 50-company external scrape in this pass. |

## Validation Commands

- Server targeted writing/job-board suite: 16 files, 461 tests passed.
- App targeted writing/job-board suite: 8 files, 100 tests passed.
- LinkedIn/content focused rerun after prompt fixes: 4 files, 139 tests passed.
- App TypeScript: `tsc --noEmit` passed.
- Server TypeScript: `tsc --noEmit` passed.
- Diff hygiene: `git diff --check` passed.
