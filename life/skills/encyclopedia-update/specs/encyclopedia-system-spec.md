# Encyclopedia Architecture — Spec

**Version:** 1.0
**Last updated:** 2026-03-15
**Feature location:** System-level spec governing the Encyclopedia system. Individual skill specs at `~/.claude/skills/{encyclopedia-update,encyclopedia-compile,encyclopedia-librarian,encyclopedia-interviewer}/specs/{name}-spec.md`

## Purpose

An architectural spec for the personal Encyclopedia — a personal life-history system composed of 8 modular source files, a compiled biographical document, and 4 interacting skills (update, compile, librarian, interviewer) plus the journaling-assistant as primary input source. This spec documents the cross-cutting contracts, shared patterns, and system-level rules that no single skill spec owns. Individual skill specs remain authoritative for skill-specific behavior; this spec governs the seams between them.

## User Mandates

- **Approval gate:** The 8 modular files, compiled Encyclopedia, and Open Threads & Goals must NEVER be written to Google Drive without the user's explicit approval of the specific changes — regardless of which skill or context triggers the write (2026-03-15)
- **Archive rule:** Every compiled Encyclopedia save to Drive must include a timestamped archive copy at `gdrive:Claude/The Journal/Encyclopedia Archive/Encyclopedia (${DATETIME}).md`. Primary save and archive save are one atomic operation. Verify archive exists after saving. (2026-03-15)
- **Near-verbatim preservation:** Both journaling-assistant and encyclopedia-interviewer must record the user's words with only spelling/grammar/clarity fixes — no interpretation, advice, editorializing, or affirmations (2026-03-15)
- **Detail-level system:** 4 levels (Full, Personal, Professional, Public) control how much intimate detail appears. Applies to both compile and librarian. Default is Full. Level must be established before generating any output. (2026-03-15)
- **Librarian is the mandatory search entry point:** All searches across journal entries, encyclopedia files, text histories, and misc documents must go through the encyclopedia-librarian skill (2026-03-15)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| 8 modular files rather than a single document | Each file has distinct update frequency and content type (e.g., Chronicle is append-only, Status Snapshot is rewritten each update). Separation enables targeted updates without rewriting the whole system. | Single master document (rejected: monolithic rewrites are slow and error-prone), database (rejected: loses readability and portability) |
| Compiled Encyclopedia as a separate artifact | The modular files are optimized for maintenance; the compiled document is optimized for reading. Different audiences, different structures. | Read modular files directly (rejected: fragmented reading experience), only maintain compiled doc (rejected: loses the maintenance benefits of modular structure) |
| Update skill as the sole writer | Centralizes all write-path logic (approval gate, routing, durability test, conflict detection) in one place. Other skills produce content but delegate writes. | Each skill writes directly (rejected: approval gate and routing logic would be duplicated across 4+ skills) |
| Durability test before routing | Filters out ephemeral/trivial content before it enters the permanent record. Confirmed interview content bypasses this (already vetted through the interview process). | No filter (rejected: modular files accumulate noise), manual curation only (rejected: too slow for daily journaling volume) |
| Career arc boundary: history in Core Identity, present-tense in Status Snapshot | Core Identity is the permanent record (rarely rewritten); Status Snapshot is rewritten each update to reflect current state. Prevents the same information from drifting across two files. | Single file for career (rejected: mixes permanent facts with volatile status), chronological only (rejected: loses the "present portrait" use case) |
| Deep Search as opt-in, not default | Mining text histories and misc documents is slow and may surface sensitive content. Explicit approval ensures the user controls when deep searches happen. | Always search everything (rejected: slow, may surface unwanted content), never search texts (rejected: loses valuable context) |
| Interview entries carry routing metadata | `Interview Metadata` section in entries tells the update skill what's confirmed vs. unconfirmed, enabling differential treatment without manual triage. | No metadata (rejected: update skill can't distinguish confirmed facts from speculative leads), separate tracking file (rejected: adds coordination complexity) |

## System Architecture

### Skill Interaction Map

```
[User's day] → journaling-assistant
                    │
                    ├─ Saves daily/misc entry to Drive
                    ├─ Reads Open Threads & Goals for context
                    ├─ At session end → invokes encyclopedia-update
                    └─ Monthly → suggests encyclopedia-interviewer

[encyclopedia-update] ← sole writer to modular files
    │
    ├─ Reads new journal entries (daily + misc + interview)
    ├─ Applies durability test (bypassed for confirmed interview content)
    ├─ Routes content to appropriate modular file(s)
    ├─ Presents changes for approval → writes to Drive
    └─ Maintains Entry Index

[encyclopedia-compile] ← reads all 8 files, writes compiled doc
    │
    ├─ Reads all modular files from Drive
    ├─ Synthesizes into narrative biography
    ├─ Applies detail-level filtering
    └─ Saves compiled doc + archive copy (atomic)

[encyclopedia-librarian] ← read-only, search & report
    │
    ├─ Reads modular files, journal entries, compiled doc
    ├─ Optional: Deep Search across texts, misc docs
    ├─ Generates templated or freeform reports
    └─ May invoke writing-voice for output

[encyclopedia-interviewer] ← gap discovery & structured interview
    │
    ├─ Reads modular files to identify gaps
    ├─ Conducts interview, saves entry to Drive
    └─ Entry includes Interview Metadata for update skill
```

### The 8 Modular Files

Source of truth at `gdrive:Claude/The Journal/System/`, cached locally at `~/.claude/encyclopedia/`:

| File | Content Type | Update Pattern |
|------|-------------|----------------|
| Core Identity | Permanent biographical facts | Rarely updated; append for new milestones |
| Status Snapshot | Present-tense portrait | Rewritten each update cycle |
| People Database | People & groups with tiers | Add/update entries as people appear |
| Chronicle | Significant life events | Append-only (never rewrite existing entries) |
| Beliefs and Positions | Political worldview | Update positions; track evolution |
| Predictions | Predictions lifecycle | Add new; resolve existing |
| Open Threads and Goals | Active threads, goals, resolved | Most volatile; updated frequently |
| Preferences and Reference Data | Lookup/reference data | Updated as preferences change |

### Shared Patterns

**Approval gate flow** (used by update + compile):
1. Skill prepares all changes
2. Presents grouped summary (additions / modifications / removals, by file)
3. Waits for the user's explicit approval
4. Only then writes to Drive

**UNCLEAR flagging** (used by journaling-assistant + interviewer):
- Ambiguous or potentially misheard passages are flagged with `[UNCLEAR: ...]`
- Flagged passages must be resolved (confirmed or corrected) before the entry is saved

**Monthly review** (coordinated between update + journaling-assistant):
- First session of each month, update skill runs a comprehensive review
- Journaling-assistant suggests running encyclopedia-interviewer for gap filling
- These are suggestions, not forced workflows

## Dependencies

- Depends on: Google Drive via rclone (`gdrive:` remote), journaling-assistant (primary content source), writing-voice (librarian output)
- Depended on by: All encyclopedia skills (governed by this spec's cross-cutting rules), CLAUDE.md (approval gate and search mandates)

## Relationship to Skill Specs

This spec does NOT supersede individual skill specs. The hierarchy:
1. **This spec** — cross-cutting contracts, shared patterns, system-level mandates
2. **Skill specs** — skill-specific behavior, internal workflow, skill-specific mandates
3. If a conflict exists between this spec and a skill spec, flag it for the user rather than silently resolving

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

- **Monthly review sequencing:** Document the exact interaction between update's monthly review and journaling-assistant's gap audit hook — currently implicit
- **Interview metadata schema:** Formalize the structure of the `Interview Metadata` section that interviewer produces and update consumes
- **Deep Search approval unification:** Librarian and interviewer both have Deep Search with slightly different approval models — could be unified
- **Todoist integration failure contract:** Update spec mentions non-blocking Todoist failures but the error reporting pattern is undefined

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-15 | 1.0 | Initial spec | New | — | 118c52ce-0a35-4287-a452-77984243491f |
