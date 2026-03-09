# Agent #13: Networking Outreach

**Type:** 2-agent pipeline
**Domain:** `networking-outreach`
**Feature Flag:** `FF_NETWORKING_OUTREACH`
**Code:** `server/src/agents/networking-outreach/`
**Interactive:** No (autonomous)

## Sub-agents

### Researcher
Target contact analysis, common ground identification, connection path assessment, outreach plan design.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `analyze_target` | MID | Assess target contact — professional interests, recent activity, industry, seniority |
| `find_common_ground` | MID | Identify shared connections, industry overlap, complementary expertise, mutual interests, recommended approach angle |
| `assess_connection_path` | MID | Evaluate connection degree (direct/2nd_degree/cold), approach strategy, value proposition, risk level |
| `plan_outreach_sequence` | MID | Design the full message sequence — types, tone, themes, goal |

### Writer
Personalized multi-touch message sequence generation. Each message type has strict quality scoring and anti-pattern detection.

**Tools:**
| Tool | Model Tier | Purpose |
|------|-----------|---------|
| `write_connection_request` | PRIMARY | Initial connection request (hard limit: 300 chars). Scored for personalization, no generic patterns, specific hooks. |
| `write_follow_up` | PRIMARY | Follow-up messages (hard limit: 500 chars each). Requires NEW personalization hooks not used in previous messages. |
| `write_value_offer` | PRIMARY | Value-first message (100-150 words). Offers something specific (insight/intro/resource/perspective). Must position expertise without explicit self-promotion. |
| `write_meeting_request` | PRIMARY | Meeting request (75-100 words). Frames as mutual benefit, specific topic, easy out. Never "pick your brain" or "informational interview". |
| `assemble_sequence` | MID | Compile all messages into final markdown report with quality notes, timing guidance, personalization summary. |
| `generate_three_ways` | MID | Three Ways Power Move — 3 strategic recommendations for a hiring manager, each addressing a specific company challenge with proof from the user's background. Added Sprint 62. |

## Messaging Methods

Three delivery methods with different character constraints and coaching guidance (added Sprint 63):

| Method | Max Chars | Description |
|--------|-----------|-------------|
| `group_message` | 8,000 | Free messaging via shared LinkedIn groups (preferred — no credits) |
| `connection_request` | 300 | Direct connection request with note |
| `inmail` | 1,900 | LinkedIn InMail (uses ~5 credits/week) |

The selected `MessagingMethod` is stored in `state.messaging_method` and injected into the writer's context to enforce character limits and framing.

`MESSAGING_METHOD_CONFIG` in `types.ts` defines labels, maxChars, descriptions, and coaching text for each method.

## Message Sequence

5-message sequence with strict timing guidance:

| Message | Timing | Char Limit |
|---------|--------|-----------|
| Connection Request | Send immediately | 300 |
| Follow-Up #1 | 3-5 days after connection accepted | 500 |
| Follow-Up #2 | 5-7 days after follow-up #1 | 500 |
| Value Offer | 7-10 days after follow-up #2 | ~1,000 words |
| Meeting Request | 3-5 days after value offer | 75-100 words |

## Quality Scoring

Each message is auto-scored (0-100) with deductions for:
- Exceeding character limits
- Missing personalization hooks
- Repeating personalization hooks from prior messages
- Generic patterns: "pick your brain," "in transition," "looking for opportunities," "expand my network"
- Generic value offer language: "comprehensive methodology," "thought leader," "passionate about"

## Three Ways Power Move

Added Sprint 62. Generates 3 strategic recommendations tailored to a specific hiring manager and company:
1. Each addresses a specific company challenge (not generic)
2. Each draws on the user's proven experience (with specific role/achievement citation)
3. Each includes an opening line that positions the user as a peer, not a supplicant

Stored in `ctx.scratchpad.three_ways_document`.

## Platform Context

Reads from prior sessions:
- `why_me_story` — colleaguesCameForWhat, knownForWhat, whyNotMe (from CareerIQ positioning)
- `positioning_strategy` — informs value proposition framing
- `evidence_items` — source for specific achievements to reference in value offers

Writer also cross-references last 5 approved/published `content_posts` (Supabase query in `buildAgentMessage`) — allows writer to reference recent LinkedIn posts as shared context with the target.

## Output

Final report (markdown) includes:
- All 5 messages with char counts, quality scores, personalization hooks
- Timing guidance section
- Personalization summary (all hooks used, per message)
- Overall quality score (average across messages)
- Quality notes (flagging over-limit or below-threshold messages)
- Engagement tips

## SSE Events

| Event | Fields |
|-------|--------|
| `stage_start` / `stage_complete` | stage, message, duration_ms? |
| `transparency` | stage, message |
| `message_progress` | message_type: OutreachMessageType, status: 'drafting' \| 'reviewing' \| 'complete' |
| `sequence_complete` | session_id, report: string, quality_score: number, message_count: number |
| `pipeline_error` | stage, error |

## Inter-Agent Communication

None — autonomous pipeline.

## Related

- [[Project Hub]]
- [[LinkedIn Content Writer]] — posts cross-referenced in outreach writer context
- [[Job Finder]] — NI network data used in job discovery
- [[Resume Builder]] — provides positioning_strategy

#agent/networking-outreach #status/done #sprint/63
