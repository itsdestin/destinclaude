# Encyclopedia Update — Spec

**Version:** 1.4
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/encyclopedia-update/`

## Purpose

The Encyclopedia Update skill is the central processing layer of the Encyclopedia system. It reads new journal entries (daily entries and misc entries), applies a durability test to each piece of information, routes durable content into the correct modular source file(s) using a defined routing table, enforces file-specific update rules (append-only, patch, rewrite, etc.), and saves results to Google Drive — but only after the user explicitly approves every proposed change. It runs automatically at the end of every journaling session (invoked by the journaling-assistant skill) and can also be triggered manually. It supports two modes: incremental (default, processing only entries newer than the last update) and full rebuild (all entries from scratch, used only when files are missing or explicitly requested).

## User Mandates

- **2026-03-13 — Approval gate:** Modular files and the compiled Encyclopedia must NEVER be written/saved to Google Drive without the user's explicit approval of the specific changes. Present a grouped summary, wait for approval, and do not proceed on ambiguous responses. *(CLAUDE.md global rule + SKILL.md Step 7)*
- **2026-03-13 — No silent overwrites:** Never silently overwrite existing content in Core Identity, Beliefs & Positions, or any file where contradictions arise. Flag contradictions and ask the user before resolving. *(SKILL.md 6a, 6e, Source-of-Truth Principles)*
- **2026-03-13 — Deletion skepticism:** Do not remove or substantially rewrite core content based on a single journal entry unless it explicitly and unambiguously states the prior information is wrong. Absence is not negation. *(SKILL.md Source-of-Truth Principles)*
- **2026-03-13 — Encyclopedia Archive Rule:** Every time the compiled Encyclopedia is saved to Google Drive, a timestamped archive copy MUST also be saved to `gdrive:Claude/The Journal/Encyclopedia Archive/`. Primary save and archive save are one atomic operation. *(CLAUDE.md global rule)*
- **2026-03-13 — Recency rule:** When journal entries contradict each other, prefer the most recent entry. Flag ambiguous contradictions for the user. *(SKILL.md Source-of-Truth Principles)*
- **2026-03-13 — Scope proportionality:** The larger and more destructive a proposed change to existing content, the higher the bar of evidence required. A throwaway comment does not override a well-established file section. *(SKILL.md Source-of-Truth Principles)*
- **2026-03-13 — Durability test required:** Every piece of information must pass the durability test (narrative-durable, reference-durable, or durably changed something) before being routed. Ephemeral details are always skipped. *(SKILL.md The Durability Test)*
- **2026-03-13 — Write only changed files:** Do not rewrite unchanged files. Only save files that actually have modifications. *(SKILL.md Step 8)*
- **2026-03-13 — Monthly review on first session of month:** When the Last Updated date is in a previous month, run a monthly review (staleness, relevance, structural checks, archival) before the normal incremental update. *(SKILL.md Step 2, Monthly Review)*
- **2026-03-13 — Career arc boundary:** Core Identity tracks the historical arc (job titles, dates, reasons). Present-tense role details (supervisors, day-to-day work) belong exclusively in Status Snapshot. *(SKILL.md 6a)*
- **2026-03-13 — Todoist integration gated:** Only create Todoist tasks for new near-term goals with concrete target dates, and only after the user confirms. Never let a Todoist failure block the update. *(SKILL.md Step 10)*

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| 8 modular files instead of a single monolith | Each file has a distinct update pattern (append-only, rewrite, patch, etc.) that would conflict in a single document. Modular structure enables targeted updates and reduces risk of unintended overwrites. | Single compiled encyclopedia (original design, now downstream only); fewer files with mixed content |
| Incremental mode as default | Most sessions produce a small number of new entries. Reading all entries every time would be slow and wasteful. Incremental mode reads only entries newer than Last Updated. | Always full rebuild; diff-based detection |
| Routing table with explicit per-file rules | Prevents ambiguity about where information belongs. A single fact can route to multiple files (e.g., paying off debt routes to both Status Snapshot and Chronicle). | Free-form judgment per entry; single-destination routing |
| Durability test before routing | Filters out ephemeral content (weather, scheduling minutiae) that would clutter permanent files. The journal entry itself is the record for ephemeral details. | Include everything; time-based decay |
| Approval gate before every save | The user's explicit requirement. Prevents incorrect inferences, unwanted tier assignments, or mischaracterizations from being persisted. | Auto-save with post-hoc review; save with undo capability |
| Status Snapshot: patch, don't rewrite | Preserves unchanged sections and avoids accidentally dropping content when only one section has new info. | Full rewrite each session (original approach); append-only with periodic consolidation |
| Chronicle is append-only and permanent | Life events should never be deleted or modified after the fact. The historical record is sacrosanct. | Editable chronicle; time-windowed pruning |
| People Database tier system (1-4) | Captures emotional significance, not just contact frequency. Default to Tier 3 when uncertain; include tier in approval so the user can override. | No tiers; binary important/not-important; five-tier system |
| Monthly review cadence | Prevents staleness without being intrusive. Staleness thresholds (4 weeks for Snapshot, 6 months for People) are calibrated to each file's natural update frequency. | Weekly review; quarterly review; no scheduled review |
| Entry Index maintained alongside modular files | Provides a lightweight lookup table for searching past entries without reading every file. Rebuilt from scratch during full rebuild. | No index (search files directly); database-backed index |
| Monthly archival to System Archive | Provides point-in-time snapshots for recovery and historical comparison. One folder per month with all 8 files. | No archival (rely on Drive versioning); daily snapshots; annual snapshots |

## Current Implementation

### Entry Points

The skill is invoked in three ways:
1. **Automatically** by the `journaling-assistant` skill at the end of every daily journaling session.
2. **Manually** when the user says "update my encyclopedia", "update open threads", "sync the encyclopedia", "rebuild my encyclopedia", "update goals", "update my goals", or "add a goal".
3. **Full rebuild** when a modular file is missing or the user explicitly requests a rebuild from scratch.

### Incremental Update Flow (Default — Steps 1-10)

**Step 1 — Read system state:** Read the `Last Updated` date from any modular file header (e.g., Status Snapshot). All files should share the same date after a successful update. If any system file is missing, fall back to full rebuild.

**Step 2 — Monthly review check:** If the Last Updated date is in a previous calendar month (i.e., this is the first session of the current month), run the monthly review process before proceeding.

**Step 3 — Identify new entries:** List files in both `gdrive:Claude/The Journal/Daily Entries/` and `gdrive:Claude/The Journal/Misc. Entries and Information/`. Filter to files with dates strictly after the Last Updated date. Skip non-date files in Daily Entries. If no new entries exist, update Last Updated on all files and finish.

**Step 4 — Read new entries:** Read each new entry in chronological order (daily and misc interleaved by date). For raw transcript entries, extract the user's substantive statements and ignore assistant messages and voice-input noise.

**Step 5 — Read current modular files:** Read all 8 modular files to understand current state before proposing changes.

**Step 6 — Process and route:** For each new entry, apply the information routing table. Each piece of information that passes the durability test is assigned to one or more destination files. File-specific update rules are then applied:

- **6a. Core Identity** — High bar, preserve and protect. Almost never updated. Changes require explicit flagging. Career arc boundary: only historical arc, not present-tense role details. Style: narrative prose, reads like biography.
- **6b. Status Snapshot** — Most frequently updated. Patch specific details that changed; leave unchanged content intact. Present-tense, scannable. Sections: current role, school, relationship, living situation, finances, health, active interests, emotional state.
- **6c. People Database** — Patch individual entries. Update Last Known Contact, Current Situation, Narrative as warranted. Maintain the Appears In Index table at the bottom of the file: when an entry substantively discusses a person, append the entry reference with a 3-8 word context snippet (daily: `YYYY-MM-DD (context)`, misc: `YYYY-MM-DD/title (context)`). Create new entries only when sufficient context exists. Assign tiers (1-4) based on holistic rubric. Update group entries for group dynamics (groups get Appears In Index rows only when discussed as a unit). Omit empty fields.
- **6d. Chronicle** — Append events and arc updates. Events are dated, titled, tagged by domain (career, relationship, family, health, financial, political, social, personal), graded by significance (major/notable/minor), and optionally linked to named arcs. Arc updates have a lower bar than standalone events.
- **6e. Beliefs & Positions** — Preserve and append evolution. Worldview section almost never updated. Position changes: update current position, add previous stance to evolution changelog with date and reasoning. Admired figures added with reasoning. Never silently overwrite.
- **6f. Predictions** — Lifecycle tracking. New predictions added to Active with original call, confidence, and what would change the user's mind. Revisions logged with date and reasoning (original preserved). Resolved predictions moved with outcome, verdict (correct/partially correct/wrong/superseded), and takeaway.
- **6g. Open Threads & Goals** — Threads: resolve, update, add (with Source column), or migrate to goals. Goals: complete, update, add (near-term or long-term), promote, or drop. Recently Resolved: clean out items older than 30 days. Defined table schemas and status values.
- **6h. Preferences & Reference Data** — Additive, rarely removed. Organized by category (Food & Drink, Restaurants, Media, Tech Setup, Social Spots, Anti-Preferences, Partner's Sizes & Favorites, Proposal & Wedding Notes, Date & Activity Ideas, Contact Info, Memberships, Other). Pure reference, no narrative.

**Step 7 — Present changes for approval:** Display all proposed changes grouped by file. Each file section shows specific additions, modifications, and removals. Ask "Do you approve these updates?" Wait for explicit approval. Handle partial approval (apply only approved changes), full rejection (skip saving), and ambiguous responses (ask for clarification).

**Step 8 — Save changed files:** Update Last Updated header on every modified file. Write files to local cache (`~/.claude/encyclopedia/`) via Write tool, then push to Google Drive via `rclone copy` (CLI). Only write files that actually changed. Confirm all files saved.

**Step 9 — Update Entry Index:** Read the Entry Index, add a row for each new entry processed (date + 1-2 sentence topic summary + People column listing substantively discussed individuals), update Last Updated, and save. People column uses first names when unambiguous; full names to disambiguate. Only substantive mentions — not passing references.

**Step 10 — Todoist integration:** Check if any new near-term goals with concrete target dates were added. If so, offer to create corresponding Todoist tasks. Only create after the user confirms. Todoist failures do not block the update. Skip silently if no actionable goals were added.

### Quoting vs. Paraphrasing Policy

Use direct quotes when exact words matter (emotional weight, political positions, personality-capturing language, revealing statements about others). Paraphrase when substance matters but wording doesn't (factual positions, situational updates, summarizable opinions).

### Source-of-Truth Principles

Four governing rules apply across all files:
1. **Contradictions:** Do not silently overwrite when a new entry contradicts a file and the discrepancy isn't explained by natural change. Flag and ask.
2. **Deletions and Major Rewrites:** Approach with skepticism. Absence is not negation.
3. **Scope of Changes:** Proportional evidence bar — throwaway comments don't override established sections.
4. **Recency:** Prefer most recent entry when entries conflict. Flag ambiguous cases.

### Monthly Review Process

Triggered on the first journaling session of each calendar month. All proposed changes go through the normal approval flow.

1. **Staleness check:** Status Snapshot sections not updated in 4+ weeks. People Database entries with Last Updated 6+ months old. Beliefs & Positions for stale context or resolvable predictions. Predictions with elapsed timeframes. Open Threads & Goals with Last Referenced 30+ days old.
2. **Relevance check:** People Database entries unreferenced for 6+ months (suggest tier demotion/removal). Preferences & Reference Data for outdated items. Chronicle is exempt (append-only, permanent).
3. **Structural check:** File size, organization logic, cross-file inconsistencies. Minor fixes applied without asking; major reorganization requires approval.
4. **Monthly archival:** Save all 8 files to `gdrive:Claude/The Journal/System Archive/YYYY-MM/`.

### Full Rebuild Fallback

Triggered when any modular file is missing or the user explicitly requests a rebuild. Reads ALL entries in both journal folders, reads the existing compiled Encyclopedia as reference, synthesizes all 8 files from scratch, rebuilds the Entry Index, presents everything for review, then saves with today's date.

### Interview Entry Processing

When processing entries produced by the `encyclopedia-interviewer` skill (identifiable by an `## Interview Metadata` section), the skill applies a clarification to the durability test:

- **Confirmed content** (items the user directly validated during the interview) is presumed to pass the durability test. This is not a mandate change — content specifically solicited to fill an identified gap in Core Identity, People Database, etc. is inherently narrative-durable or reference-durable by virtue of why it was solicited.
- **Unconfirmed leads** (Deep Search findings not addressed or validated) go through the standard durability test.
- **Routing hints** in the Interview Metadata section are used as advisory context alongside the standard routing table. They inform but do not override routing logic.
- All other rules (file-specific update logic, approval gate, source-of-truth principles) apply normally.

### Searching Past Entries

When the skill needs prior context (contradiction verification, arc tracing), it starts with the Entry Index for lookup, then reads specific entries by date.

## Dependencies

- **Depends on:**
  - `rclone` with configured `gdrive:` remote (Google Drive access for journal entry reads, Drive archive writes, and encyclopedia cache push)
  - Local encyclopedia cache at `~/.claude/encyclopedia/` — modular source files read from and written to local cache
  - Google Drive folder structure: `Claude/The Journal/Daily Entries/`, `Claude/The Journal/Misc. Entries and Information/`, `Claude/The Journal/System/`, `Claude/The Journal/System Archive/`, `Claude/The Journal/Entry Index.md`
  - Todoist MCP tools (Step 10, non-blocking — for creating tasks from new goals)
  - `journaling-assistant` skill (primary invoker at end of journaling sessions)
- **Depended on by:**
  - `encyclopedia-compile` skill (compiles the 8 modular files into the single Encyclopedia document)
  - `encyclopedia-librarian` skill (searches across the modular files this skill maintains)
  - `journaling-assistant` skill (invokes this skill, then depends on updated files for future sessions)
  - `encyclopedia-interviewer` skill (delegates all modular file writes to this skill, produces entries with routing hints)

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec created from 610-line SKILL.md | New | User |
| 2026-03-14 | 1.1 | Added interview entry processing clarification (confirmed content presumed durable), added encyclopedia-interviewer as dependent | Implementation | User |
| 2026-03-14 | 1.2 | Added `Appears In` field to People Database schema and People column to Entry Index Step 9 (people-entry cross-reference feature) | Implementation | User |
| 2026-03-14 | 1.3 | Removed all Mid-Day Notes references (Step 3 skip, Step 3b, Step 4 incorporation, Step 6 intro/6g, Full Rebuild skip). Mid-Day Notes replaced by inbox-processor skill. | Deprecation | User |
| 2026-03-15 | 1.4 | Updated modular file read/write paths from Drive to local encyclopedia cache per Git + Drive hybrid migration | Implementation | User |
