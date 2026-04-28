# Live User Audit - 2026-04-28

Persona lens: a real job seeker using the product without engineering context. I drove the live app at `localhost:5173` across Today, Benchmark Profile, LinkedIn Growth, Find Jobs, Tailor Resume, Pipeline/application workspace, interview prep, thank-you, follow-up, networking, and profile setup.

I did not send messages, submit external applications, archive/delete data, or approve generated LinkedIn content. I did start one LinkedIn profile optimization and one LinkedIn post draft to assess quality and process behavior.

## Blockers

1. **Broad Search appears to do nothing.**
   - Path: `Workspace -> Find Jobs -> Broad Search`
   - Test: entered `VP Operations`, left location as `Cincinnati, OH`, radius `25 miles`, posted within `Last 7 days`, clicked `Search`.
   - Result: no visible loading state, no result state, no error state, and no console error after waiting. A user has no idea whether the search started, failed, or ignored the click.
   - Why it matters: this blocks the primary "find jobs first, then tailor resume" path.

2. **Insider Jobs scan button also gives no visible feedback.**
   - Path: `Workspace -> Find Jobs -> Insider Jobs -> Job Scan`
   - Test: selected one company (`Point B`), set Remote-only search shape, clicked `Scan for Jobs`.
   - Result: no visible loading state, no completion state, no result state, and no console error after waiting.
   - Why it matters: Insider Jobs is one of the strongest product differentiators; a silent click feels broken.

3. **Playbook navigation routes to Today/dashboard content.**
   - Path: hamburger/top nav `Playbook`, and direct URL `/workspace?room=playbook`.
   - Result: URL changes to playbook, but the page renders the Today dashboard (`Benchmark Profile powers CareerIQ`, daily briefing, etc.).
   - Why it matters: users will think the Playbook is broken or unfinished.

4. **Application cards contain an archive action inside the main open-card button.**
   - Path: `Workspace -> Pipeline -> Pipeline`
   - DOM shows buttons like `Open application: ...` containing a nested `Archive application` button.
   - Why it matters: nested interactive controls are brittle for accessibility and can produce accidental opens/archive clicks. I did not click Archive because that would alter application state.

5. **Scraped job descriptions are extremely noisy and leak site chrome into downstream writing forms.**
   - Path: `Application -> Resume` and `Application -> Cover Letter`
   - Example: JRG Partners JD includes nav text, phone numbers, form fields, tag cloud, archives, footer links, HTML entities, and unrelated posts.
   - Why it matters: this pollutes cover letters, resume strategy, and interview prep unless every downstream prompt aggressively cleans it. Users also lose trust when they see raw scraped clutter.

## Polish / UX Friction

1. **Insider Jobs explains "one search shape at a time" but allows multiple work modes at once.**
   - Remote and Hybrid were both active when I arrived. I was also able to turn On-site on, making all three active.
   - The explanatory copy is good, but the control should enforce the rule or present clear modes: `Local/on-site`, `Hybrid near city`, `Remote nationwide`.

2. **Insider Jobs selected company state is much improved, but the visible row still feels subtle.**
   - Positive: selected companies now show a check, blue rail/border, and `Selected` label.
   - Remaining concern: at small viewport sizes, the selected list begins below the scan card and is easy to miss until focus jumps down.

3. **Date filters visually work for Today, 3, 7, 14, and 30 days.**
   - I selected each option and the selected state updated correctly in the UI.
   - This is not an issue, just a validation note.

4. **LinkedIn Profile Audit tab does not feel like an audit.**
   - Clicking `Profile Audit` shows the same current-profile intake and `Edit Profile` step.
   - There is no visible five-second-test score, headline assessment, About-section assessment, or "what is wrong / what to fix first" audit state.

5. **LinkedIn `Edit Profile` starts a model run without making that cost/commitment clear.**
   - The button label sounds like opening an editor, but it starts a 20-round optimization flow.
   - Better label: `Generate Profile Rewrite` or `Optimize Profile Sections`.

6. **LinkedIn profile optimization output quality is promising, but progress language is confusing.**
   - The headline output was strong and explicitly referenced five-second strength.
   - The UI showed `0 / 5 sections done` while a headline was already ready for review. If this means "approved sections", label it that way.

7. **LinkedIn content strategy quality is strong, but the generated post has a hashtag bug.**
   - Topic ideas were specific, evidence-based, and aligned to benchmark-candidate positioning.
   - The generated post was strong overall, but it included both normal hashtags in the body and a duplicate line with double hashes: `##manufacturingoperations ##leanmanufacturing ...`
   - This would look unprofessional if copied directly.

8. **LinkedIn post generation takes long enough that the status UI needs more useful education.**
   - After topic selection, the screen showed internal-ish progress logs for over a minute before the post appeared.
   - The user should see what is happening in plain language: selecting story angle, checking proof, writing hook, trimming for LinkedIn, checking hashtags.

9. **Tailor Resume landing page is much clearer now, but existing malformed saved applications still surface.**
   - The new page language is good: "Tailor your resume to a job you actually want."
   - Existing ADT application still shows the company name inside the role: `ADT hiring IT Manager - Cloud Operations in Irving, TX | LinkedIn`.
   - This may be historical data, but it is still visible in the picker and pipeline.

10. **Cover Letter page has the right strategic framing, but starts with huge raw input boxes.**
    - The copy says it will tell the WHY ME story, which is the right direction.
    - As a user, the first emotional experience is still scrolling through giant raw resume/JD fields rather than seeing the strategy, draft, or cleaned inputs.

11. **Interview Prep activation creates a confusing draft interview state.**
    - After `Activate Interview Prep`, it shows an `Upcoming Interviews` item labeled `Application draft video` even though I had not scheduled an interview.
    - The schedule form is functional, but the default draft item may confuse users.

12. **Thank-you and follow-up forms are clean, but they are not obviously connected to scheduled interview data.**
    - Thank-you form had the company and role filled, but interview date/type were blank.
    - If an interview was scheduled in the prep workflow, users will expect those details to follow them into thank-you notes.

13. **Mobile/tablet application tabs are dense.**
    - Application-level tabs (`overview`, `resume`, `cover letter`, `networking`, `interview prep`, `thank you note`, `follow up email`, `offer negotiation`) are usable in DOM, but visually crowded on the small in-app browser viewport.

14. **No browser console errors appeared during the pass.**
    - The failures above are user-visible state/flow issues, not obvious client-side crashes.

## Strong Signals

- The redesigned navigation/product positioning is much better: Today -> LinkedIn -> Jobs -> Resume -> Pipeline matches the strategy.
- Benchmark Profile currently shows a strong 90% readiness state and useful story/differentiator signals.
- Profile setup language is excellent: the "10-15 minutes now, hours saved later" framing is exactly the right promise.
- LinkedIn content topics were genuinely good: specific, differentiated, rooted in proof, and aligned with the benchmark-candidate thesis.
- The Tailor Resume landing page now makes the core value proposition understandable to a normal user.

## Recommended Fix Order

1. Fix Broad Search and Insider Jobs scan feedback/results first.
2. Fix Playbook routing or remove/hide Playbook until it has a real surface.
3. Clean scraped job descriptions before storing/showing/feeding them into generated assets.
4. Make Insider Jobs work mode mutually exclusive or convert it into explicit search-shape presets.
5. Split LinkedIn Profile Audit from Profile Rewrite and add true five-second-test scoring.
6. Fix LinkedIn hashtag duplication and add clearer generation progress.
7. Tighten application/pipeline accessibility around nested archive buttons and duplicate `Open resume` labels.
