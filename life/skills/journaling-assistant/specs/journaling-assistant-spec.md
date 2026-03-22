# Journaling Assistant — Spec

**Version:** 1.4
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/journaling-assistant/`

## Purpose

The Journaling Assistant facilitates two kinds of journaling for the user: structured daily entries that capture the full breadth of a day across life domains, and freeform misc entries for rants, topic explorations, political beliefs, and anything else worth recording. It operates as an extraction tool — inquisitive and direct, never therapeutic — using Socratic-style follow-up questions to draw out detail, then compiling near-verbatim prose in the user's voice. Sessions end with saving the entry to Google Drive, updating Google Calendar, and invoking the encyclopedia-update skill.

## User Mandates

- **(2026-03-13) No interpretation, advice, or editorializing.** The skill must ask questions to draw out detail and record what is said. It is not therapy.
- **(2026-03-13) Near-verbatim recording only.** The only permitted edits to the user's words are spelling, grammar, and minor clarity fixes. No paraphrasing, condensing, reinterpreting, or cutting content. Slang, profanity, nicknames, and colloquial phrasing must be preserved as-is.
- **(2026-03-13) Unclear passages must be flagged before saving.** Any garbled, mistranslated, or unclear text must be marked `[UNCLEAR: original text]` and clarified with the user before the entry is compiled.
- **(2026-03-13) Encyclopedia update approval gate.** Per CLAUDE.md, all modular source file and encyclopedia changes must be presented to the user for explicit approval before writing. The encyclopedia-update skill invoked in Step 8 must honor this gate.
- **(2026-03-13) No affirmations or "great session" language.** Session closings must be neutral and brief. No mirroring emotions, validating, or using warm/companion-like language.
- **(2026-03-13) Late-night date rule.** Sessions between 12:00 AM and 4:00 AM must file the entry under the previous day's date.
- **(2026-03-13) Calendar step must not be silently skipped.** If no calendar candidates are found, the skill must say so explicitly and ask if the user disagrees, rather than skipping the step without mention.
- **(2026-03-13) Domain sweep must be collective, not serial.** Uncovered domains are mentioned together in one casual question at the end, not asked about individually.
- **(2026-03-13) No misc entry calendar step.** Calendar integration applies only to daily entries.
- **(2026-03-13) Encyclopedia update is mandatory after both entry types.** Both daily and misc entries must invoke encyclopedia-update after saving.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Two entry types (daily vs. misc) with distinct flows | Daily entries need structured domain coverage and calendar integration; misc entries are freeform and topic-driven. Separate flows avoid forcing structure on rants or forcing open-endedness on daily logs. | Single unified flow with optional structure; tag-based entry types |
| Socratic/inquisitive tone, not therapeutic | The user wants detail extraction, not emotional processing. Direct follow-ups ("what happened next?") yield richer entries than reflective prompts ("what does that mean to you?"). | Reflective/therapeutic style; purely passive transcription |
| 11 domain coverage framework tracked mentally | Ensures comprehensive daily coverage without making the session feel like a checklist. Domains are tracked internally, not presented to user. | Explicit domain checklist shown to user; no domain tracking |
| Single collective sweep for uncovered domains | Asking about each uncovered domain individually is tedious. One casual question lets the user decide what's worth covering. | Domain-by-domain prompting; skip uncovered domains entirely |
| Near-verbatim prose in the user's voice (not assistant's) | The journal is the user's record, not an assistant's summary. Preserving their exact words, slang, and tone ensures authenticity. | Assistant-written summary; bullet-point extraction; Q&A transcript format |
| Open Threads staleness check (>14 days) | Threads that haven't been referenced in two weeks may be stale — either resolved without being logged or forgotten. Surfacing them prevents thread rot. | Fixed staleness threshold per thread; no staleness detection |
| Political domain gets special probes (evolution + prediction) | Political positions and predictions have dedicated encyclopedia files that track reasoning and lifecycle. Extra probes ensure the journal captures the data those files need. | Same treatment as all domains; separate political journaling mode |
| Entry saved via temp file + rclone (CLI) or rendered markdown (web) | Dual-environment support. CLI path uses temp files to avoid writing journal content to the local filesystem permanently. Web path accommodates lack of CLI tools. | Direct rclone pipe; local file persistence; API-based upload |
| Google Calendar integration as post-save step | Calendar events are derived from the full session, so they must come after the conversation is complete. Post-save positioning also prevents calendar failures from blocking entry preservation. | Calendar prompts during conversation; pre-save calendar step |
| Proactive topic suggestions (1-2 per session, domain-gated) | Surfaces updates the user might not think to mention without making the session feel interrogative. Capped at 1-2 to avoid overload. | No proactive suggestions; full suggestion list each session |
| Session opener varies every time | Avoids the session feeling formulaic. No stock phrases like "how was your day?" — phrasing adapts to time of day and how the user opened. | Fixed opening question; rotating from a preset list |

## Current Implementation

### Trigger Phrases

The skill activates on phrases like: "let's journal", "journal entry", "I want to write in my journal", "daily journal", "start my journal", "I want to rant about something", "I want to write down my thoughts on X", "let's catch up", "debrief my day", "help me reflect on today."

### Session Flow — Daily Entries (Steps 1–9)

**Step 1 — Entry Type:** Determine whether this is a daily entry or misc entry. Phrasing varies naturally based on context. Daily entries proceed through Steps 2–9; misc entries jump to the Misc Entry Flow.

**Step 1b — Context Load (daily only):**
- Read `~/.claude/encyclopedia/Open Threads and Goals.md` (via Read tool on CLI, Google Drive connector on web).
- Perform staleness check: flag any threads/goals with "Last Referenced" date >14 days old.
- Open with a varied, natural question — no stock phrases.

**Step 2 — Day Overview:** High-level day description with 1-2 targeted follow-ups.

**Step 3 — Domain Coverage:** Follow conversation naturally across 11 tracked domains (Work, School/Education, Relationship/Partner, Friends/Social, Family, Finances/Investing, Health/Physical, Mental/Emotional, Interests/Projects, Political/Beliefs, Spontaneous/Other). Political domain gets special handling: position evolution probes and prediction probes (confidence level, conditions, resolution tracking). At wind-down, a single collective sweep covers any untouched domains. Proactive topic suggestions (1-2 per session) are woven in when relevant domains arise.

**Step 4 — Threads and Goals Check-In:** Surface any unaddressed threads from Step 1b. Lightweight goals check-in focused on near-term in-progress/not-started goals. Stale items (>14 days) get specific attention. Conversational, not scripted.

**Step 5 — Close:** Brief opening for anything else. No scripted phrasing.

**Step 6 — Save the Entry:** Compile full session into a `.md` file with two parts:
- *Part 1:* Full session text in the user's voice, organized by topic, near-verbatim. Unclear passages flagged and clarified before compiling. Domain headers omitted if nothing substantive was said.
- *Part 2:* Summary section with Mood, Highlights & Lowlights (2-4 items), Threads & Goals progress, and Other Notes.
- Filename: `YYYY-MM-DD.md` (late-night rule: sessions 12–4 AM use previous day's date).
- CLI: write to `/tmp/journal-entry.md`, `rclone copyto` to `gdrive:Claude/The Journal/Daily Entries/`, then delete temp file.
- Web: render as markdown, instruct user to save manually.

**Step 7 — Google Calendar Integration:** Scan session for: (A) retrospective significant past events, (B) forward-looking future commitments. Present candidates to the user (or explicitly state none found). On confirmation, use `gcal_list_calendars` and `gcal_create_event`. Report any failures. Close neutrally.

**Step 8 — Update Encyclopedia System:** Invoke the `encyclopedia-update` skill, passing the entry date as context.

**Step 8b — Monthly Gap Audit (first session of each calendar month only):** After encyclopedia-update completes, run a lightweight gap analysis across the 8 modular files (top 5 findings). Present briefly and suggest an interview ("Say 'interview me' anytime"). Continue with normal closeout regardless. If the user opts in immediately, invoke the `encyclopedia-interviewer` skill — the journaling session is already complete. This is suggestion-only; never forced; does not block session completion.

After the encyclopedia update completes (and optional gap audit), confirm to the user that the entry and encyclopedia system are handled. Do not add affirmations or "great session" language — keep it neutral and brief.

### Session Flow — Misc Entries

1. Acknowledge topic (if given) or ask what they want to get into.
2. Let the user lead; ask follow-ups for depth/specifics/nuance. For political misc entries, apply position evolution and prediction probes.
3. Check if anything else before compiling.
4. Compile in near-verbatim prose, the user's voice. Short descriptive title. Format: `# [Title]` / `*[Date]*` / prose content. Summary section only if entry is long enough to warrant one. Flag unclear passages before compiling.
5. Save as `YYYY-MM-DD - [Short Topic Title].md` to `gdrive:Claude/The Journal/Misc. Entries and Information/`.
6. Invoke `encyclopedia-update` skill with the filename as context.
7. Confirm entry and encyclopedia update are saved, then close.

No calendar step for misc entries.

### Searching Past Entries

- Entry Index: `gdrive:Claude/The Journal/Entry Index.md` (topic-based and people-based lookup — includes a People column listing substantively discussed individuals per entry).
- Daily entries: `gdrive:Claude/The Journal/Daily Entries/`.
- Misc entries: `gdrive:Claude/The Journal/Misc. Entries and Information/`.
- Open threads/goals: `~/.claude/encyclopedia/Open Threads and Goals.md`.
- CLI access via `rclone ls` / `rclone cat`; web access via Google Drive connector.

### Tone

Direct, neutral affect, short non-compound questions. Forbidden patterns: "That sounds really hard." / "It's great that you're reflecting on this." / "What do you think that says about you?" Acceptable patterns: "What happened after that?" / "Did that resolve?" / "How'd that leave you feeling?"

### Proactive Topic Suggestions

Used 1-2 per session within relevant domains during Step 3. Topics include: academic progress/graduation, partner's career or academic updates, upcoming events or trips, investment/financial updates, pets, upcoming social events/travel, political developments being tracked.

## Dependencies

- **Depends on:**
  - `encyclopedia-update` skill — invoked at the end of every session (daily Step 8, misc post-save) to update the 8 modular source files
  - `encyclopedia-interviewer` skill — optionally invoked from the monthly gap audit (Step 8b) if the user opts in
  - Google Drive via rclone (`gdrive:` remote) — all entry storage, entry index
  - Google Calendar MCP tools (`gcal_list_calendars`, `gcal_create_event`) — daily entry Step 7
  - Open Threads and Goals local cache (`~/.claude/encyclopedia/Open Threads and Goals.md`) — read at session start for thread/goal context
  - Entry Index (`gdrive:Claude/The Journal/Entry Index.md`) — used for searching past entries; includes People column for person-based lookups
- **Depended on by:**
  - `encyclopedia-librarian` skill — searches journal entries produced by this skill
  - `encyclopedia-compile` skill — compiles encyclopedia from modular files that this skill triggers updates to (via encyclopedia-update)

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec | New | User |
| 2026-03-14 | 1.1 | Added monthly gap audit hook (Step 8b) and encyclopedia-interviewer dependency | Implementation | User |
| 2026-03-14 | 1.2 | Documented Entry Index People column for person-based lookups (people-entry cross-reference feature) | Implementation | User |
| 2026-03-14 | 1.3 | Removed Mid-Day Notes system (Steps 1b triage, 2-4 weaving, 7 calendar candidates, 9 archive/clear). Mid-Day Notes replaced by inbox-processor skill. Removed python-docx dependency. Removed archive design decision. | Deprecation | User |
| 2026-03-15 | 1.4 | Updated Open Threads read path from Drive to local encyclopedia cache (~/.claude/encyclopedia/) per Git + Drive hybrid migration | Implementation | User |
