# Encyclopedia Librarian — Spec

**Version:** 1.2
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/encyclopedia-librarian/`

## Purpose

The Encyclopedia Librarian is a read-only reporting and briefing skill that produces targeted, purpose-built documents from the Encyclopedia system's eight modular source files, journal entries, text message histories, and miscellaneous documents stored on Google Drive. Unlike the Encyclopedia Compile skill (which always produces the full compiled Encyclopedia), the Librarian generates focused outputs for specific situations — career briefs for job applications, person briefings before meetings, relationship context before visits, period retrospectives, political profiles, topic syntheses, or any custom freeform request. It supports seven predefined templates plus a freeform mode, four detail levels to control personal information exposure, and an optional Deep Search mode that mines primary sources beyond the modular files.

## User Mandates

- **(2026-03-13)** The Librarian is strictly read-only — it NEVER writes to or modifies any modular source file, journal entry, or other primary source. It only reads and synthesizes.
- **(2026-03-13)** Deep Search requires the user's explicit approval before execution. The Librarian must never begin reading primary sources for a deep search without a clear "yes" or equivalent from the user. Two paths: the user requests it outright, or the Librarian suggests it and waits for approval.
- **(2026-03-13)** Every report must have a detail level (Full, Personal, Professional, Public) established before generation. Ask the user which level to use unless they specify upfront or the template has a strong default.
- **(2026-03-13)** Detail-level filtering is an editorial decision, not mechanical redaction — content must read naturally at every level, not like something was visibly removed.
- **(2026-03-13)** The detail-level filter applies to all content in the report, including narrative sections, Deep Search results, and direct quotes.
- **(2026-03-13)** When producing voice-matched output (cover letters, political statements, emails the user would send under their own name), invoke the `users-writing-voice` skill. Use third person for reference/briefing documents.
- **(2026-03-13)** Don't over-read files — start with the sources specified by the template. Only read additional files if the initial sources are insufficient.
- **(2026-03-13)** If the user's request is essentially the full Encyclopedia, suggest the Compilation Skill instead.
- **(2026-03-13)** After producing any output, offer to save it to an appropriate location under `gdrive:Claude/The Journal/Librarian Reports/`.
- **(2026-03-13)** This skill is the mandatory entry point for ANY search across journal entries, encyclopedia files, text histories, or miscellaneous documents (per CLAUDE.md). Manual file searches should not be attempted — always invoke this skill.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Seven predefined templates + freeform mode | Covers the most common report types while preserving flexibility for anything custom | Purely freeform (rejected: too slow for recurring requests), rigid template-only (rejected: too limiting) |
| Four detail levels (Full, Personal, Professional, Public) | Reports serve different audiences — a job application needs different filtering than personal reflection | Binary public/private toggle (rejected: too coarse), per-field redaction (rejected: too granular and mechanical) |
| Deep Search as opt-in, not default | Mining raw JSONL text histories and all journal entries is time-intensive; most reports are well-served by modular files alone | Always-on deep search (rejected: slow and unnecessary for simple requests), no deep search (rejected: loses access to rich primary sources) |
| Template default detail-level suggestions | Reduces friction — a Career Brief almost always wants Professional level | Always ask (rejected: repetitive), always Full (rejected: inappropriate for external-facing documents) |
| Read-only design — never writes to source files | Separation of concerns: the Librarian synthesizes, the Update skill writes. Prevents accidental modifications during report generation | Read-write hybrid (rejected: risk of unintended edits to canonical data) |
| Pre-synthesized sources preferred over raw data in Deep Search | Message analyses and categorized message files are faster to read and already synthesized; raw JSONL is a fallback | Always read raw JSONL (rejected: slow and redundant when analyses exist) |
| Offer to save reports to Librarian Reports directory | Reports have archival value (especially Period Reviews) but saving should be optional, not automatic | Auto-save all reports (rejected: clutters Drive), never save (rejected: loses valuable retrospectives) |
| Intent recognition before template selection | If a request clearly maps to a template, use it without asking; if ambiguous, ask briefly | Always ask which template (rejected: friction for obvious requests), always guess (rejected: may misinterpret) |

## Current Implementation

### Mode Overview

The skill operates in three modes:

1. **Predefined Templates (1-6):** The user names or implies a template and provides parameters. The Librarian generates without extended Q&A, asking only for missing required parameters.
2. **Freeform (Template 7):** The user describes a custom need. The Librarian asks clarifying questions (purpose, audience, length, detail level, inclusions/exclusions), then generates with no fixed structure.
3. **Deep Search (cross-cutting):** An optional extension available to any template or freeform request. Mines primary sources beyond the 8 modular files.

### The Seven Templates

#### 1. Career Brief
- **Purpose:** Professional narrative for job applications, networking, or campaign outreach.
- **Trigger phrases:** "career summary", "career brief", "help me with my application for X", "put together my professional background".
- **Parameters:** Target role/org, audience, backstory depth, detail level (default: Professional).
- **Sources:** Core Identity, Status Snapshot, Beliefs & Positions (if political role), People Database (professional connections), Chronicle (career milestones).
- **Output:** Origin story (variable depth), professional arc as narrative, target-role fit, relevant skills mapped to role, forward-looking close.
- **Voice:** If output is something the user would send directly (cover letter, intro email), invoke `users-writing-voice`. Otherwise third person.

#### 2. Person Briefing
- **Purpose:** Everything known about a specific person or group, organized for quick reading.
- **Trigger phrases:** "brief me on [name]", "what do I know about [name]", "tell me about [name]".
- **Parameters:** Person/group name, optional context, detail level (default: Personal).
- **Sources:** People Database (target entry + connections — use Appears In Index at bottom of file to identify relevant journal entries), Chronicle (events involving person), Status Snapshot, targeted journal entries (via Appears In Index rather than scanning Entry Index).
- **Output:** Core profile, relationship dynamics, relevant context, connected people, open threads.
- **Group handling:** If about a group, structure around group dynamics first, then individual summaries of core members.

#### 3. Relationship Briefing
- **Purpose:** Context about the user's partner and the relationship, structured around a particular situation.
- **Trigger phrases:** "visiting my partner, catch me up", "what should I know before [partner situation]", "brief me on my partner's friends".
- **Parameters:** Context/purpose, detail level (default: Full).
- **Sources:** People Database (partner + partner's circle + groups), Status Snapshot, Chronicle, Open Threads & Goals, Preferences & Reference Data.
- **Output:** Varies by context — visit prep (relationship state, their situation, friend dynamics, practical info), difficult conversation prep (issue history, their perspective, patterns, what's worked), gift shopping (favorites, sizes, mentioned wants, upcoming dates).

#### 4. Period Review
- **Purpose:** Retrospective narrative covering a specific time period.
- **Trigger phrases:** "review the last six months", "what happened this year", "walk me through fall semester", "summarize since [date]".
- **Parameters:** Time period, optional domain emphasis, detail level (default: Full).
- **Sources:** Chronicle (filtered), archived Status Snapshots (from System Archive), People Database (changed relationships), Beliefs & Positions (evolution), Predictions (made/resolved), Open Threads & Goals (opened/resolved), journal entries.
- **Output:** Period overview, major events chronologically, life-area arcs (career, relationship, social, academic, financial, mental/emotional, political), before/after comparison, unresolved threads.
- **Tone:** Reflective and honest, not a highlight reel.
- **Archival:** Offer to save to `gdrive:Claude/The Journal/Librarian Reports/Period Reviews/`.

#### 5. Political Profile
- **Purpose:** The user's political worldview, positions, and track record as a standalone document.
- **Trigger phrases:** "put together my political profile", "lay out my positions", "articulate my platform".
- **Parameters:** Audience, depth (overview vs. comprehensive), whether to include predictions, detail level (default: Professional).
- **Sources:** Beliefs & Positions (primary), Predictions (if requested), Core Identity (values context).
- **Output:** Core diagnosis, political identity, worldview (economics, government, theory of change), specific positions by domain, admired figures, theory of change (state-level strategy, anti-partisan slate, ranked choice), prediction track record (optional).
- **Voice:** For political audiences, invoke `users-writing-voice` with analytical-formal tone.

#### 6. Topic Synthesis
- **Purpose:** Everything known about a specific topic, synthesized across all sources.
- **Trigger phrases:** "pull together everything about [topic]", "what do I know about [topic]", "full picture on [topic]".
- **Parameters:** Topic, organization preference (chronological or thematic), detail level (ask if unclear).
- **Sources:** All modular files filtered for relevance, Entry Index for journal entries, specific entries as needed.
- **Output:** Flexible structure — whatever best serves understanding of the topic.

#### 7. Freeform
- **Purpose:** Anything that doesn't fit templates 1-6.
- **Interaction:** Conversational intake — the user describes the need, Librarian asks clarifying questions (purpose, audience, length, detail level, inclusions/exclusions), then generates.
- **No fixed structure.** Organization determined by Librarian's judgment based on stated purpose.

### Detail Levels

| Level | Label | Included | Filtered Out |
|-------|-------|----------|--------------|
| 1 | Full | Everything, unfiltered | Nothing |
| 2 | Personal | Personal life included but softened | Specific fights/arguments (-> "tensions"), detailed mental health episodes, specific substance use, raw financial numbers |
| 3 | Professional | Career, education, political philosophy, skills, surface personal context | Relationship conflicts, mental health details, substance use, financial specifics, intimate relationship dynamics |
| 4 | Public | Only what a stranger could comfortably read | All above + relationship details beyond "in a relationship", friend group dynamics, sensitive biographical details |

### Deep Search

**Authorization:** Mandatory explicit approval from the user before execution. Two activation paths: (1) the user requests it directly ("deep search", "search my texts", "go deeper"), which counts as approval; (2) Librarian suggests it after producing a modular-file-based report, explains what it would search and why, then waits for approval.

**Sources searched:**

| Source | Location | Search method |
|--------|----------|---------------|
| Text message histories | `gdrive:Claude/The Journal/Misc. Entries and Information/Text Messages (03-08-2026)/contacts/*.jsonl` | Read `_index.json` first, then relevant JSONL files (format: `{"t":"...","d":"in/out","m":"..."}`) |
| Text message analyses | `.../Text Messages (03-08-2026)/Misc/messages analyses/` | Pre-built thematic analyses — read before raw JSONL when they cover the topic |
| Categorized messages | `.../Text Messages (03-08-2026)/Misc/messages sorted by category/` | Pre-sorted by topic (career, interests, political, predictions, values) — check first for topic-specific searches |
| Daily journal entries | `gdrive:Claude/The Journal/Daily Entries/YYYY-MM-DD.md` | Use Entry Index to identify relevant dates, then read specific entries |
| Misc entries & documents | `gdrive:Claude/The Journal/Misc. Entries and Information/` | Includes political philosophy notes, relationship documents, informational entries. List directory to find relevant files |

**Search strategy:** Start narrow (use Entry Index, `_index.json`, pre-built analyses), go wide only if needed. Prefer pre-synthesized over raw. **Person searches: check the `Appears In` field in the People Database first — it lists every journal entry with context snippets, enabling targeted reads instead of scanning. For text messages, read the contact's JSONL file.** Topic searches start with categorized messages. Time-period searches filter by dates. The Entry Index People column provides the reverse lookup ("who was in this entry?"). Always summarize what was found and which sources were read.

**Output integration:** Deep Search findings are woven into the report structure of the active template — no separate "Deep Search Results" section. Use attributed direct quotes for color/evidence. Flag contradictions with modular files. Note gaps where expected findings were absent.

### Modular Source Files

All eight files are cached locally at `~/.claude/encyclopedia/` (source of truth: `gdrive:Claude/The Journal/System/`):

1. Core Identity.md
2. Status Snapshot.md
3. People Database.md
4. Chronicle.md
5. Beliefs and Positions.md
6. Predictions.md
7. Open Threads and Goals.md
8. Preferences and Reference Data.md

Files are read via the Read tool from `~/.claude/encyclopedia/[filename].md`.

### Report Saving

Reports can optionally be saved to `gdrive:Claude/The Journal/Librarian Reports/` with template-specific subdirectories:
- Career Briefs: `.../Librarian Reports/Career Briefs/`
- Period Reviews: `.../Librarian Reports/Period Reviews/`
- Other reports: `.../Librarian Reports/`

## Dependencies

- **Depends on:**
  - `rclone` with configured `gdrive:` remote — journal entries, text histories, and report output destinations are on Google Drive
  - Local encyclopedia cache at `~/.claude/encyclopedia/` — modular source files read from local cache
  - 8 modular source files maintained by the `encyclopedia-update` skill
  - Entry Index (`gdrive:Claude/The Journal/Entry Index.md`) — for locating relevant journal entries
  - Text message archive at `gdrive:Claude/The Journal/Misc. Entries and Information/Text Messages (03-08-2026)/` — for Deep Search
  - `users-writing-voice` skill — invoked when producing voice-matched output (cover letters, political statements)
- **Depended on by:**
  - CLAUDE.md mandates this skill as the entry point for all journal/encyclopedia/text-history searches
  - Any workflow or conversation where the user asks "what did I say about X", "search my journal", "brief me on [person]", etc.

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

- **Audience-aware filtering:** When a report is about a specific individual, the Librarian should ask whether the subject(s) will be reading the report. If yes, filter out potentially embarrassing or unflattering details — harsh characterizations, recorded frustrations, candid assessments the user wouldn't say to their face — while preserving the report's usefulness. This filter would stack with the detail-level filter.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec | New | — |
| 2026-03-14 | 1.1 | Updated Person Briefing sources and Deep Search strategy to use People Database `Appears In` field and Entry Index People column (people-entry cross-reference feature) | Implementation | — |
| 2026-03-15 | 1.2 | Updated modular file read paths from Drive to local encyclopedia cache per Git + Drive hybrid migration | Implementation | — |
