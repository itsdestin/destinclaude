# Encyclopedia Interviewer — Spec

**Version:** 1.1
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/encyclopedia-interviewer/`

## Purpose

The Encyclopedia Interviewer is a standalone skill that proactively identifies gaps in the Encyclopedia system's 8 modular source files and conducts focused interview sessions to fill them. It produces a journal record (misc entry with routing hints) and delegates all modular file writes to the `encyclopedia-update` skill. It addresses a gap in the journaling system: daily journaling intentionally limits its questioning (1-2 follow-ups, single collective domain sweep), so deeper exploration of topics, backstory, and inconsistencies rarely happens organically.

## User Mandates

- **2026-03-14 — Near-verbatim only.** Same rules as journaling assistant: spelling/grammar/clarity fixes only, no paraphrasing, condensing, reinterpreting, or cutting content. Slang, profanity, nicknames, and colloquial phrasing preserved as-is.
- **2026-03-14 — No interpretation/advice/editorializing.** Ask questions, record answers. No therapy, no affirmations, no "great session" language.
- **2026-03-14 — Approval gate.** All modular file changes require the user's explicit approval. This is enforced via `encyclopedia-update`'s existing gate — the interviewer never writes modular files directly.
- **2026-03-14 — Deep Search leads are not facts.** Unconfirmed leads from primary source mining never override confirmed modular file content. Leads are tracked separately from confirmed content in Interview Metadata.
- **2026-03-14 — Monthly audit is suggestion-only.** The monthly gap audit hook in the journaling assistant may suggest an interview, but must never force one. It must not block session completion.
- **2026-03-14 — Quick-hits every session.** Every interview session must include at least 3 quick-hit clarifications, even in user-directed mode.
- **2026-03-14 — Unclear passages must be flagged.** Same as journaling assistant: `[UNCLEAR: original text]` markers must be resolved before saving.
- **2026-03-14 — Late-night date rule.** Sessions between 12:00 AM and 4:00 AM file the entry under the previous day's date.


## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Standalone skill, not a journaling-assistant mode | Clean separation of concerns — interviewer can evolve independently. Different interaction pattern (agenda-driven vs. conversational). Avoids bloating the already-large journaling skill. | New mode within journaling assistant; encyclopedia-update subcommand |
| Delegates modular file writes to encyclopedia-update | Single source of truth for write logic. Pipeline consistency — encyclopedia-update remains the single writer with its approval gate, durability test, and file-specific rules. No duplication of write logic. | Direct writes from interviewer; new shared write library |
| Confirmed interview content presumed to pass durability test | Content was specifically solicited to fill identified durable gaps. Asking "is this durable?" about content elicited to fill a Core Identity gap is redundant — it was solicited because it's durable. This is an interpretation of the existing durability test mandate, not a change to it. | Full durability test on all interview content; skip durability test entirely |
| Unconfirmed Deep Search leads still get full durability test | Leads from text histories and old journal entries haven't been validated by the user. They may be outdated, misinterpreted, or wrong. The durability test and approval gate provide appropriate filtering. | Treat all Deep Search content as confirmed; reject all Deep Search content |
| Gap categories are equal priority | No single gap type is inherently more important than others. Staleness and missing backstory are equally worth addressing. The user picks what to focus on. | Priority ordering of categories; weighted scoring |
| Two modes: system-driven and user-directed | System-driven enables comprehensive gap discovery. User-directed enables focused exploration of a specific topic. Both are valuable in different contexts. | Single mode only; three or more modes |
| Quick-hit round in every session | Low-cost way to chip away at minor issues (stale dates, outdated facts) without requiring deep discussion. Ensures every session produces some concrete updates even if deep dives are brief. | Quick-hits only in system-driven mode; optional quick-hits |
| Interview Metadata section in entry | Provides structured routing context for encyclopedia-update without cluttering the narrative. Confirmed vs. Leads separation ensures the update skill knows what's validated and what needs further scrutiny. | Separate metadata file; inline annotations; no metadata |
| Monthly audit hook in journaling assistant | Natural touchpoint — the user is already in a journaling session. Lightweight (top 5 findings, brief list). Suggestion-only ensures it's not intrusive. | Separate scheduled reminder; notification-based; no proactive suggestion |
| Deep Search requires approval | Primary source mining is time-consuming and reads potentially sensitive content. Gate ensures the user is aware and consenting. Same pattern as encyclopedia-librarian. | Auto-run Deep Search; never allow Deep Search |
| Adaptive depth in deep-dive phase | Follows the user's energy. Pushing for detail when they're giving short answers is counterproductive. Exploring further when they're engaged yields richer content. | Fixed number of follow-ups per topic; always push for maximum depth |

## Current Implementation

### Entry Points

The skill is invoked in two ways:
1. **Directly** when the user says "interview me", "let's do an interview", "interview me about X", "fill gaps in my encyclopedia", or "encyclopedia interview".
2. **Via suggestion** from the journaling assistant's monthly audit hook, which presents a brief gap list and suggests an interview.

### Session Flow (4 Phases)

**Phase 1 — Setup:**
- Determine mode: system-driven (no topic specified) or user-directed (topic specified).
- Read all 8 modular files from the local encyclopedia cache (`~/.claude/encyclopedia/`).
- Optionally run Deep Search (with approval) to identify unconfirmed leads from primary sources.
- Present categorized findings (system-driven) or topic-focused findings (user-directed). Let the user pick topics and order.

**Phase 2 — Quick-Hit Round (always, 3-5 questions):**
- Targeted yes/no or short-answer questions drawn from easy inconsistencies, stale data, and date confirmations.
- Every session includes at least 3 quick-hits, even in user-directed mode.
- Examples: verifying current jobs, checking stale dates, confirming unchanged facts.

**Phase 3 — Deep-Dive (1-3 topics, adaptive depth):**
- Structured questions with prepared follow-ups.
- Follows the user's energy: short answers get one probe, engaged answers get explored.
- Between topics, interleave 1-2 related quick-hits.
- Same tone rules as journaling assistant: direct, neutral, no therapy/affirmations.

**Phase 4 — Wrap-Up:**
- "Anything else?" then transition to output.

### Output

**A. Interview Entry:** Saved as a misc entry to `gdrive:Claude/The Journal/Misc. Entries and Information/YYYY-MM-DD - Interview [Topic].md`. Contains near-verbatim Q&A organized by topic, plus an Interview Metadata section with routing hints and confirmed vs. unconfirmed leads. Late-night date rule applies. Unclear passages flagged and resolved before saving.

**B. Encyclopedia-Update Invocation:** After saving the entry, invoke `encyclopedia-update` with the entry filename. Confirmed content bypasses the durability test; unconfirmed leads go through the standard test. Routing hints are advisory context. Standard approval gate applies.

**C. Entry Index Update:** Add a row for the interview entry (date + topic summary) to the Entry Index.

### Gap Analysis Categories

Five categories, all equal priority:
1. **Missing backstory** — thin People Database narratives, Chronicle timeline gaps, unexplained Core Identity references.
2. **Staleness** — Status Snapshot sections 4+ weeks stale, old People Database Last Updated dates, elapsed Predictions timeframes.
3. **Cross-file contradictions** — Snapshot vs. People Database inconsistencies, Chronicle events with no Snapshot reflection, tier vs. mention-frequency mismatches.
4. **Underdeveloped positions** — Beliefs & Positions entries without evolution logs, positions without reasoning, journal topics with no formal position.
5. **Unconfirmed leads** (Deep Search only) — people in texts not in People Database, misc entry topics not in Beliefs & Positions, journal events not in Chronicle.

### Deep Search Rules

- Can mine text histories, journal entries, and misc documents during gap analysis.
- Requires explicit approval before execution.
- Findings are leads to ask about, not facts to merge.
- Confirmed modular file content is never overridden by unconfirmed primary source data.
- Confirmed vs. Leads tracked separately in Interview Metadata.

### Tone

Direct, neutral, no therapy/affirmations. Same rules as journaling assistant. The interviewer is more directive — it has an agenda and drives toward specific gaps — but the affect is the same.

## Dependencies

- **Depends on:**
  - `encyclopedia-update` skill — all modular file writes are delegated to this skill
  - `rclone` with configured `gdrive:` remote — saving interview entries, reading primary sources for Deep Search
  - Local encyclopedia cache at `~/.claude/encyclopedia/` — modular source files read from local cache
  - Google Drive folder structure: `Claude/The Journal/System/`, `Claude/The Journal/Misc. Entries and Information/`, `Claude/The Journal/Daily Entries/`, `Claude/The Journal/Entry Index.md`
  - `encyclopedia-librarian` skill (Deep Search mechanics, reused conceptually but not invoked directly)
- **Depended on by:**
  - `journaling-assistant` skill — monthly audit hook suggests interview sessions
  - `encyclopedia-update` skill — processes interview entries with routing hints

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-14 | 1.0 | Initial spec and skill created | New | the user |
| 2026-03-15 | 1.1 | Updated modular file read paths from Drive to local encyclopedia cache per Git + Drive hybrid migration | Implementation | the user |
