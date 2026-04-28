# Human QA Drive-Through — David Harrington Synthetic COO Scenario

Date: 2026-04-27
Tester posture: real first-time user / career strategist
Candidate: David Harrington, VP Operations → COO / SVP Manufacturing Operations
Application created: Coventry Industrial Holdings QA — Chief Operating Officer
Primary route tested: profile setup → Benchmark Profile → tailor resume → cover letter → networking → interview prep → thank-you note

## Overall Read

The profile setup and resume tailoring flow are materially stronger than before. The app now finds the real strategic tension in this scenario: David has strong multi-site manufacturing operations proof, but not formal full P&L ownership or clear board/PE sponsor presentation proof. The best parts of the run were the discovery questions, Benchmark Profile output, resume strategy, and tailored resume attribution discipline.

The biggest weak spots were downstream communication rendering and content polish. Follow-up fixes now normalize thank-you note payloads, enforce clean LinkedIn character-limit handling, remove assistant-style interview-prep closing copy, and stop the resume review panel from calling a run export-safe while high-risk discovery questions remain unanswered.

## Blockers

| Area | Finding | User impact | Status |
| --- | --- | --- | --- |
| Profile setup suggestions | Multi-select starters originally duplicated selected labels because a state updater had side effects under React dev double-invocation. | Discovery answers became polluted and looked broken. | Fixed during this run in `InterviewView.tsx`; focused tests pass. |
| Thank-you note | Generated note renders as raw JSON string: `{"content":"Maria...","subject_line":...}` instead of a formatted email body. | Real user would think the feature is broken and would not copy/send it. | Fixed. UI hook unwraps nested JSON payloads; writer now parses repaired JSON correctly and normalizes generated note fields. |
| Networking message | LinkedIn connection request generated exactly `300 / 300 chars` and visibly cuts off mid-word: “multi-site manufacturing operations backgr”. | Message is unusable without manual repair; undermines trust in character-limit handling. | Fixed. Writer now trims at sentence/word boundaries and recalculates character count after cleanup. |
| Networking message | Output preserved bracketed placeholder language: `[former Cincinnati Manufacturing Consortium board member]`. | User cannot send the message as written; it sounds like AI scaffolding. | Fixed. Writer strips bracket scaffolding and falls back when instructional placeholders remain. |
| Interview prep | Report content appeared while the page still said “Building your interview brief.” | User cannot tell whether generation is finished or safe to use. | Partially fixed. Role/company hints now flow into generation and assistant-style “Next Steps” copy was removed; live run still needs a visual confirmation pass for the generating/report transition. |

## Polish / Quality

| Area | Finding | Recommendation |
| --- | --- | --- |
| Profile setup | Intake copy is strong: “10-15 minutes now. Hours saved later” lands well and explains the value of the pain. | Keep this direction. |
| Profile setup | Discovery questions were excellent and career-strategist-grade: scale, crisis, hidden systems, role motivation, reference language, objection handling, first-year proof. | Preserve this question architecture. |
| Benchmark Profile | Output was specific and memorable: “manufacturing operator who can tighten the whole system” and “turning recurring firefighting into repeatable operating cadence.” | Strong; feed this language into LinkedIn, resume summary, outreach, and interview prep. |
| Resume tailoring | Strategy correctly treated missing full P&L ownership as high risk and framed $210M operating-budget accountability honestly. | Strong. Keep honest-adjacent proof behavior. |
| Resume tailoring | Final review said “No review notes / Safe to export” even though Strategy still had unanswered discovery questions for high-risk P&L and board/PE sponsor proof. | Final review should not say “safe to export” when high-risk unanswered discovery remains. Use “Strong draft, but verify these 2 executive-risk items.” |
| Cover letter | Generated letter was grounded but too much like a resume rehash. It lacks a stronger “why Coventry / why me / why now” argument. | Prompt tightened to force strategic interpretation, benchmark-candidate framing, and role-specific business problem language; needs next live quality run. |
| Cover letter | Page example text mentions “Director of Operations” even when current application is COO. | Fixed. Tone examples are now role-neutral. |
| Interview prep | Strategic substance was strong, especially the 3-2-1 strategy and objection handling. | Keep the structure but remove app-inappropriate meta text like “If useful, I can also provide...” |
| Interview prep | Report used “Candidate” and “Unknown Role” in one section despite the app knowing David and COO. | Ensure candidate name and role are injected consistently through every section. |
| Interview prep | Synthetic company suffix “QA” triggered company-research uncertainty. | Expected for synthetic QA data; not a production concern by itself. |

## Human Judgment

Profile setup + resume tailoring are close to launch-worthy for this scenario. They feel like a real career strategist, not a generic AI wrapper.

The communications layer is not at the same quality level yet. Cover letters are acceptable but not compelling. Networking and thank-you currently have output defects that would stop a user from trusting the asset. I would fix those before using the flow in marketing demos.

## Suggested Next Fix Order

1. Run one fresh live strategy pass through cover letter, networking, interview prep, and thank-you to validate output quality with real model responses.
2. Visually confirm the interview-prep generating/report transition no longer feels stuck.
3. Continue the next human drive-through on LinkedIn editor, blog creator, carousel creator, and both job boards.
