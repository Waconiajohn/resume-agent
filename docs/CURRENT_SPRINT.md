# Sprint 30: Networking Outreach Agent (#13)
**Goal:** Build the Networking Outreach Agent as Agent #13 — a 2-agent pipeline (Researcher → Writer) that generates personalized LinkedIn connection requests and follow-up message sequences from the user's resume, positioning strategy, and target company/role.
**Started:** 2026-03-06

## Stories This Sprint

### Backend — Types & Knowledge
1. [x] Story 1: Define `NetworkingOutreachState`, `NetworkingOutreachSSEEvent`, and message types — **Status: done**
2. [x] Story 2: Write networking outreach knowledge rules (connection requests, follow-ups, personalization, timing) — **Status: done**

### Backend — Researcher Agent
3. [x] Story 3: Researcher agent config + tools (analyze_target, find_common_ground, assess_connection_path, plan_outreach_sequence) — **Status: done**

### Backend — Writer Agent
4. [x] Story 4: Writer agent config + tools (write_connection_request, write_follow_up, write_value_offer, assemble_sequence) — **Status: done**

### Backend — ProductConfig & Route
5. [x] Story 5: ProductConfig + feature flag + route + DB migration — **Status: done**

### Frontend Integration
6. [x] Story 6: `useNetworkingOutreach` SSE hook + OutreachRoom UI component — **Status: done**

### Tests
7. [x] Story 7: Server tests (38) + app tests (11) — **Status: done**

## Out of Scope (Explicitly)
- LinkedIn API integration for sending messages (requires OAuth)
- Contact import from LinkedIn (requires API)
- CRM-style contact management (separate feature)
- Email outreach (LinkedIn only for v1)
- Automated scheduling of messages (manual copy-paste for v1)
