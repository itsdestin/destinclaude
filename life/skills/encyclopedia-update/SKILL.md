---
name: encyclopedia-update
description: >
  Maintains eight modular source files that collectively represent the Encyclopedia
  system. Invoke this skill automatically at the end of every daily
  journaling session to keep all files current. Also invoke when the user says
  things like "update my encyclopedia", "update open threads", "sync the
  encyclopedia", "rebuild my encyclopedia", "update goals", "update my goals",
  or "add a goal". The default mode is incremental — it reads only journal
  entries newer than the system's Last Updated date.
---
<!-- SPEC: Read specs/encyclopedia-update-spec.md before modifying this file -->

# Encyclopedia Update Skill

## Purpose

This skill processes journal entries and routes their contents into eight modular source files. It is the central processing layer of the Encyclopedia system — it reads new journal entries, determines what information belongs in which file, applies file-specific update rules, and saves the results after the user's approval.

**Dependencies:** This skill is invoked by the `journaling-assistant` skill at the end of every daily journaling session. It can also be invoked directly.

---

## The Eight Modular Files

All files are cached locally at `~/.claude/encyclopedia/` (source of truth: `gdrive:Claude/The Journal/System/`):

| # | File | Path | Update pattern |
|---|------|------|----------------|
| 1 | Core Identity | `System/Core Identity.md` | Rare; explicit approval for any change |
| 2 | Status Snapshot | `System/Status Snapshot.md` | Rewritten every session |
| 3 | People Database | `System/People Database.md` | Individual entries patched |
| 4 | Chronicle | `System/Chronicle.md` | Append-only |
| 5 | Beliefs & Positions | `System/Beliefs and Positions.md` | Preserve and append evolution |
| 6 | Predictions | `System/Predictions.md` | Lifecycle-tracked entries |
| 7 | Open Threads & Goals | `System/Open Threads and Goals.md` | Existing logic (carried over) |
| 8 | Preferences & Reference Data | `System/Preferences and Reference Data.md` | Additive |

Each file carries a `*Last Updated: YYYY-MM-DD*` header.

---

## Information Routing

When processing a journal entry, evaluate each substantive piece of information against this routing table. A single piece of information can route to multiple files.

| Question | If yes → destination | Update logic |
|----------|---------------------|--------------|
| Is this a permanent identity fact (origin, values, education history, career arc, family structure, social structure overview)? | Core Identity | High bar. Almost never write. Explicit approval required for any change. |
| Is this about the user's present-tense status (current role, school, relationship dynamics, finances, health, emotional state, active interests, living situation)? | Status Snapshot | Replace the relevant section with the most current state. |
| Is this about a specific person (new info, changed situation, contact, relationship dynamics)? | People Database | Patch that person's entry. Create new entry if threshold met. |
| Is this about a friend group's dynamics (how a group functions, what it means to the user, membership changes)? | People Database | Patch that group's entry. |
| Is this a significant life event (milestone, decision, turning point, first-time experience, notable event)? | Chronicle | Append a new dated, tagged entry. |
| Is this a political position, worldview element, or admired figure? | Beliefs & Positions | Preserve existing content. Append to evolution log with reasoning. |
| Is this a prediction (new, revised, or resolved)? | Predictions | Add new, log revision, or move to Resolved. |
| Is this an unresolved thread, action item, or goal (new, updated, or resolved)? | Open Threads & Goals | Existing update logic (see below). |
| Is this a taste, preference, order, favorite, size, membership, or other reference datum? | Preferences & Reference Data | Add or update the relevant item. |

**When nothing routes:** Not everything in a journal entry needs to go anywhere. Ephemeral details (weather, wake-up times, scheduling minutiae, transient logistics) do not belong in any file. The journal entry itself is the record.

---

## Interview Entry Processing

When processing entries with an `## Interview Metadata` section (produced by the `encyclopedia-interviewer` skill):

- **Confirmed content** is presumed to pass the durability test — it was specifically solicited to fill identified durable gaps in the modular files.
- **Unconfirmed leads** (listed in the "Confirmed vs. Leads" section) still require the standard durability test.
- **Routing hints** are used as advisory context alongside the standard routing table — they inform but do not override the routing logic.
- All other processing rules (file-specific update logic, approval gate, source-of-truth principles) apply normally.

---

## The Durability Test

Carried over from the previous system. Apply this before routing any information:

**Durable information — route it.** Two lanes:
- **Narrative-durable:** Information that would still be true or relevant in 3+ months. Identity, relationships, career history, political views, evolving arcs, personality-revealing anecdotes, patterns of behavior.
- **Reference-durable:** Preferences, typical orders, tastes, recurring spots, sizes, favorites — things someone would want to look up when helping the user with a decision, a gift, or a plan.

**Perishable information — generally skip,** with one exception: if the perishable event has a lasting effect on how the user thinks, acts, or plans going forward, route it — framed in terms of what it changed, not as a standalone fact.

**Ephemeral details — always skip.** Weather, wake-up times, call times, scheduling minutiae, transient logistics. Exception: if ephemeral details reveal a documented pattern established across multiple entries (e.g., chronic late sleeping becomes a durable fact about daily habits).

**The decision process:** *Is this narratively durable? Is it reference-useful? Did it durably change something? Does it route to any file per the table above? If none, leave it in the journal entry where it lives.*

---

## Quoting vs. Paraphrasing

Use direct quotes when the **exact words matter** — emotional weight, political positions the user might want recalled verbatim, things that capture their voice or personality in a way paraphrase would flatten, or when someone else's words reveal something important about them or the relationship.

Paraphrase when the **substance matters but the wording doesn't** — factual positions, situational updates, opinions that can be summarized without losing meaning.

---

## Default Flow — Incremental Update

This is the normal path. Run it at the end of every journaling session.

### 1. Read system state

Read the Last Updated date from any modular file header (they should all share the same date after a successful update):

**Claude Code CLI:**
Use the Read tool to read `~/.claude/encyclopedia/Status Snapshot.md` and extract the first 3 lines.

**Claude.ai web / Claude app:**
Use the Google Drive connector to open `Claude/The Journal/System/Status Snapshot.md` and read the header.

Extract the `Last Updated` date. If any system file is missing, fall back to [Full Rebuild](#full-rebuild-fallback).

### 2. Check for monthly review

If this is the **first journaling session of the current calendar month** (i.e., the `Last Updated` date is in a previous month), run a [Monthly Review](#monthly-review) before proceeding with the normal incremental update.

### 3. Identify new entries

List both journal folders:

```bash
rclone ls "gdrive:Claude/The Journal/Daily Entries/"
rclone ls "gdrive:Claude/The Journal/Misc. Entries and Information/"
```

From **Daily Entries**, filter to files with a date in the filename (`YYYY-MM-DD.md`) that is **strictly after** the `Last Updated` date. Skip non-date files.

From **Misc. Entries and Information**, filter to files whose date prefix (`YYYY-MM-DD - ...`) is strictly after the `Last Updated` date. Include older non-standard-named misc files only on a full rebuild.

If there are no new entries in either folder, update `Last Updated` on all files to today and save. Done.

### 4. Read new entries

```bash
rclone cat "gdrive:Claude/The Journal/Daily Entries/YYYY-MM-DD.md"
rclone cat "gdrive:Claude/The Journal/Misc. Entries and Information/YYYY-MM-DD - Title.md"
```

Read each new entry in chronological order (daily and misc interleaved by date).

**Note:** Some early entries may be raw conversation transcripts. Extract the user's substantive statements and ignore assistant messages, repeated questions, and voice-input noise.

### 5. Read current modular files

Read all eight files to understand current state before making changes:

**Claude Code CLI:**
Use the Read tool to read each file from `~/.claude/encyclopedia/`:
- `~/.claude/encyclopedia/Core Identity.md`
- `~/.claude/encyclopedia/Status Snapshot.md`
- `~/.claude/encyclopedia/People Database.md`
- `~/.claude/encyclopedia/Chronicle.md`
- `~/.claude/encyclopedia/Beliefs and Positions.md`
- `~/.claude/encyclopedia/Predictions.md`
- `~/.claude/encyclopedia/Open Threads and Goals.md`
- `~/.claude/encyclopedia/Preferences and Reference Data.md`

**Claude.ai web / Claude app:**
Use the Google Drive connector to open each file under `Claude/The Journal/System/`.

### 6. Process and route

For each new journal entry, apply the routing table from the [Information Routing](#information-routing) section. For each piece of information that passes the Durability Test, determine which file(s) it belongs in and what the specific change should be.

Apply the following file-specific update rules:

---

#### 6a. Core Identity

**Update rule: High bar, preserve and protect.**

This file changes rarely. Most journal entries will produce zero Core Identity updates.

- Only update when something genuinely foundational shifts: a new career milestone that alters the arc, a change in values, a new educational achievement, a structural change to family or social life.
- **Career Arc boundary:** Core Identity tracks the historical arc (job titles, dates, why each move happened). Present-tense role details (supervisors, day-to-day work, how the role feels) belong exclusively in Status Snapshot. Skills & Capabilities stays in Core Identity.
- Never update based on mood, temporary circumstances, or a single day's events.
- Never silently overwrite existing content. Any proposed change must be flagged explicitly in the approval step.
- If a journal entry contradicts Core Identity content and the discrepancy isn't explained by natural change over time, flag the contradiction and ask the user — do not resolve it unilaterally.

**Style:** Narrative prose. Reads like biography.

---

#### 6b. Status Snapshot

**Update rule: Amend relevant sections.**

This is the most frequently updated file. Most journal entries will produce at least one Snapshot update.

- **Patch, don't rewrite.** When new information updates a Snapshot section, amend only the specific details that changed. Leave unchanged content intact — do not rewrite entire sections unnecessarily.
- The file stays present-tense and scannable. Updated details replace their outdated counterparts inline; they are not appended as dated notes.
- If a section has no new information from this entry, leave it completely untouched.
- If a significant status change occurred (cleared credit card debt, started a new job, relationship milestone), consider whether it also warrants a Chronicle entry — the Snapshot captures the new state, the Chronicle captures the event.

**Sections:** Current role, School status, Relationship status, Living situation, Financial snapshot, Health snapshot, Active interests, Current emotional state.

**Style:** Labeled sections, concise, scannable. Not narrative prose.

---

#### 6c. People Database

**Update rule: Patch individual entries.**

- **Updating existing entries:** When a journal entry mentions a person already in the database, update only the fields with new information. Always update `Last Known Contact` and `Last Updated` when there's a new interaction. Update `Current Situation` when circumstances change. Append to `Narrative` when something reveals new texture about the relationship. Update `Notes` for practical tracking items.
- **Creating new entries:** Only create a new entry when the person is mentioned with enough context to fill the Narrative field meaningfully, appears across multiple entries, or plays a clear role in an ongoing arc. Peripheral mentions ("had lunch with someone named Alex") do not warrant an entry unless they recur.
- **Tier assignment:** When creating a new entry, assign a Tier (1-4) based on the holistic rubric — not just contact frequency, but emotional significance, intellectual depth, role in ongoing arcs, and how the user describes them. Default to Tier 3 if uncertain. Include the tier in the approval step so the user can override.
- **Tier changes:** If the pattern of mentions suggests a tier no longer fits, propose a change in the approval step.
- **Group entries:** Update group-level entries when journal content addresses group dynamics, membership changes, or the role a group plays in the user's life.
- **Updating the Appears In Index:** When processing a new journal entry, update the Appears In Index table at the bottom of the People Database. For each person or group substantively discussed (they did something, were discussed, or an event involved them), append the entry reference to their row. Use format `YYYY-MM-DD (3-8 word context)` for daily entries and `YYYY-MM-DD/title (3-8 word context)` for misc entries (title is the Entry Index title verbatim). Do not add passing mentions. For groups, only add when the group itself is discussed as a unit. Create a new row if the person/group doesn't have one yet.
- **Omit empty fields.** Only include fields that have content.

**Entry schema (individuals):**

```markdown
## [Name]
- Relationship: [freeform — e.g., "Close Friend, Colleague"]
- Tier: [1-4]
- Birthday: [if known]
- Known Since: [context]
- Current Situation: [what they're doing now]
- Interests/Hobbies: [if known]
- Last Known Contact: [date and context]
- Narrative: [the texture of the relationship]
- Notes: [anything else worth tracking]
- Last Updated: [date]
```

**Entry schema (groups):**

```markdown
## [Group Name]
- Type: Friend Group
- Formed: [origin context]
- Core Members: [list]
- Narrative: [what this group means to the user, how it functions, what role it plays]
- Last Updated: [date]
```

---

#### 6d. Chronicle

**Update rule: Append events and arc updates.**

- **Standalone events:** The bar for standalone entries remains: "Would a reader of the user's life history want to know this happened?" These are milestones, decisions, turning points, first-time experiences, and notable events.
- **Arc updates:** Entries that continue an existing arc have a lower bar — they don't need to be independently significant if they track a documented trajectory. An arc update captures meaningful movement (not every minor data point) in an ongoing thread like financial recovery, career transition, emotional health, or relationship dynamics.
- Each entry is dated, titled, tagged by domain, graded by significance, and optionally linked to an arc.
- Write entries to stand alone decades later without requiring surrounding context.
- Tag with one or more domains: `career`, `relationship`, `family`, `health`, `financial`, `political`, `social`, `personal`.
- Grade significance: `major` (life-defining milestones, turning points), `notable` (meaningful events worth tracking), `minor` (arc updates, small but relevant developments).
- Optionally tag with `Arc:` when the entry is part of a continuing trajectory. Use consistent arc names across entries so they can be traced (e.g., "financial recovery", "career transition", "emotional health", "partner long-distance").

**Entry format:**

```markdown
### YYYY-MM-DD — [Short Title]
Tags: [domain tags]
Significance: [major | notable | minor]
Arc: [optional — arc name(s)]

[2-5 sentences: what happened, why it matters, what it connects to]
```

---

#### 6e. Beliefs & Positions

**Update rule: Preserve and append evolution.**

- **Worldview section:** Almost never updated. Changes here reflect fundamental shifts in how the user sees politics and the world. Requires explicit approval and high confidence.
- **Positions:** When a journal entry surfaces a new position or a shift in an existing one:
  - Update the "Current position" line with the new stance.
  - Add the previous stance to the "Evolution" changelog with a date and reasoning.
  - **Always capture the why.** A position change without reasoning is incomplete. If the journal entry doesn't include reasoning, the Journal Skill should have already probed for it — but if it's still missing, note the gap in the approval step.
- **Admired figures:** Add new ones with reasoning. Update reasoning if it evolves.
- Never silently overwrite a position. The evolution log preserves the full intellectual trajectory.

**Position format:**

```markdown
#### [Topic]
**First recorded:** [YYYY-MM-DD]
**Current position:** [1-3 sentences]

**Evolution:**
- [YYYY-MM-DD]: [What changed and why]
- [YYYY-MM-DD]: [Earlier position or original stance]
```

---

#### 6f. Predictions

**Update rule: Lifecycle tracking.**

- **New prediction:** Add to Active Predictions with original call (dated, verbatim or near-verbatim), confidence level if expressed, and what would change the user's mind if mentioned.
- **Revision:** When the user's view on an active prediction shifts, log the revision with a date and reasoning. Do not replace the original call.
- **Resolution:** When a prediction's outcome is known, move it from Active to Resolved. Add the outcome, a verdict (correct / partially correct / wrong / superseded), and a takeaway if the user reflected on it.

**Active format:**

```markdown
#### [Prediction short title]
**Original call:** [verbatim or near-verbatim, dated]
**Confidence:** [if expressed]
**Revisions:**
- [YYYY-MM-DD]: [revision and reasoning]
```

**Resolved format (adds to above):**

```markdown
**Outcome:** [what actually happened]
**Verdict:** [correct / partially correct / wrong / superseded]
**Takeaway:** [what was learned, if anything]
```

---

#### 6g. Open Threads & Goals

**Update rule: Existing logic, carried over with minor additions.**

For each new journal entry:

**Threads:**
- **Resolve** threads explicitly described as resolved or no longer relevant → move to Recently Resolved with date and note
- **Update** threads with new context → update Last Referenced date and status
- **Add** new unresolved items, situations, or problems not already listed. Include a Source column noting which journal entry first surfaced the thread
- **Migrate** threads to goals when they evolve from a tracked situation to something the user is actively working toward

**Goals:**
- **Complete** goals explicitly described as done → move to Recently Resolved with date and note
- **Update** goals with progress → update Last Referenced date and status
- **Add** new goals the user mentions — concrete plans or aspirational intentions. Near-Term (weeks to months) or Long-Term (months to years). A goal is anything framed as an intention ("I want to...", "I'm going to...", "I need to..."). Casual throwaway comments are not goals unless emphasized or returned to
- **Promote** goals from Long-Term to Near-Term when circumstances change
- **Drop** goals the user explicitly abandons → move to Recently Resolved with status "Dropped"

**Recently Resolved:** Clean out items where the Resolved date is more than 30 days old.

**Table schemas:**
- Threads: `| Thread | Source | First Mentioned | Last Referenced | Status |`
- Goals: `| Goal | Target | First Mentioned | Last Referenced | Status |`
- Recently Resolved: `| Item | Type | Resolved | Notes |`

**Thread statuses:** Ongoing, Ongoing — no update, Ongoing — new context added, Open — not yet discussed, Needs action, Open — needs context

**Goal statuses:** Not started, In progress, Planning, Aspirational, Stalled, Completed, Dropped

---

#### 6h. Preferences & Reference Data

**Update rule: Additive, rarely removed.**

- Add new preferences, orders, favorites, sizes, memberships, and reference data as they surface in journal entries.
- Update existing items when preferences change (e.g., new regular drink order replaces old one at the same place).
- Only remove items when the journal explicitly says a preference has ended or changed.
- Organize by category: Food & Drink, Restaurants, Media, Tech Setup, Social Spots, Anti-Preferences, Partner's Sizes & Favorites, Proposal & Wedding Notes, Date & Activity Ideas, Contact Info, Memberships, Other.

**Style:** Organized by category. Tables and lists where appropriate. Pure reference — no narrative needed.

---

### 7. Present changes for approval

**MANDATORY: Do NOT save anything until the user explicitly approves.**

Collect all proposed changes first, then present a single grouped summary:

```
Proposed updates (N changes across M files):

  Status Snapshot (2):
    [✓] Rewrite Financial snapshot section
    [✓] Update Active interests

  People Database (2):
    [✓] [Person A]: update Last Known Contact, add job change note
    [✓] NEW: [Person B] (Tier 3, Friend) — met through social group

  Chronicle (1):
    [✓] NEW: 2026-03-10 — Paid off credit card balance (Tags: financial)

  Open Threads & Goals (2):
    [✓] Update: Job search — new context added
    [✓] NEW GOAL (Near-Term): Pay off remaining balance before June

  Preferences & Reference Data (1):
    [✓] Add: [Coffee shop] — regular order

Reply "approve" to accept all, or list items to remove.
```

**Item removal:** Natural language — the user says "remove the [Person B] entry" or "drop the Chronicle one". Match by description. If ambiguous, ask for clarification.

- If the user approves all → proceed to save.
- If the user removes specific items → apply only the remaining approved changes.
- If the user rejects all → skip saving (still update Last Updated dates if the user confirms).
- Do NOT proceed on ambiguous responses — ask for clarification.

**Files with no changes** are omitted from the summary (no "No changes" lines).

### 8. Save all changed files

Update the `Last Updated` header on every file that was modified. Only write files that actually changed — don't rewrite unchanged files.

**Claude Code CLI:**

For each modified file, use the Write tool to save to `~/.claude/encyclopedia/[filename].md`.

After all approved changes have been written to the local cache, push the updated files to Google Drive:
```bash
rclone copy ~/.claude/encyclopedia/ "gdrive:Claude/The Journal/System/"
```
If rclone fails, warn the user but do not retry — local cache is safe and will be pushed on next successful sync.

**Claude.ai web / Claude app:**
Render each modified file as formatted markdown and instruct the user to save it to `gdrive:Claude/The Journal/System/`.

Confirm all files saved. Brief confirmation — no detailed summary unless asked.

### 9. Update Entry Index

```bash
rclone cat "gdrive:Claude/The Journal/Entry Index.md"
```

For each new entry just processed, add a row to the appropriate table (Daily or Misc). Each row contains the date, a brief topic summary (1-2 sentences), and a People column listing all substantively discussed individuals (not groups). Use first names when unambiguous; full names to disambiguate. Only include people who did something, were discussed, or were involved in an event — not passing mentions. Update `Last Updated` in the header.

```bash
cat <<'INDEX_EOF' > /tmp/entry-index.md
[full entry index content]
INDEX_EOF

if rclone copyto /tmp/entry-index.md "gdrive:Claude/The Journal/Entry Index.md"; then
    rm /tmp/entry-index.md
    echo "Entry Index saved successfully"
else
    echo "ERROR: Entry Index save failed. File preserved at /tmp/entry-index.md"
fi
```

### 10. Todoist Integration for Goals

After updating goals, check if any **new** Near-Term goals were added that have a concrete, specific target date or timeframe. If so, offer to create a corresponding Todoist task.

**Only create tasks when:**
- The goal is new (just added this session)
- It has a concrete target (not "Aspirational" or open-ended)
- The user confirms they want it added

**How to create:**
Use the Todoist MCP `add-tasks` tool to create the task with the goal description and target date. If the MCP is unavailable, skip silently.

If the response contains an error or non-2xx status, report it and skip. Do not let a Todoist failure block the update.

If no new actionable goals were added, skip silently.

---

## Source-of-Truth Principles

These rules govern how the Update Skill handles conflicts and edge cases across all files.

### Contradictions

If a new entry directly contradicts something in a modular file and the discrepancy is **not** easily explained by natural change over time (e.g., a new job replacing an old one), **do not silently overwrite.** Flag the contradiction and ask the user for clarification before making the change. When in doubt, ask.

### Deletions and Major Rewrites

Approach with skepticism. Do not remove or substantially rewrite core content (identity, relationships, political philosophy, career history) based on a single journal entry unless the entry explicitly and unambiguously states that the prior information is wrong or no longer applies. Absence is not negation — if a journal entry simply omits something, that is not grounds for deletion.

### Scope of Changes

A single journal entry can add new information and update evolving situations freely. But the larger and more destructive a change would be to existing content, the higher the bar of evidence required. A throwaway comment does not override a well-established file section.

### Recency

When entries contradict each other, prefer the most recent entry. If the contradiction is ambiguous or cannot be explained by timing, flag it and ask.

---

## Monthly Review

Run on the **first journaling session of each calendar month**, before the normal incremental update. All proposed changes go through the normal approval flow — nothing is modified without the user's explicit approval.

### Staleness Check

Scan each file for content that may be outdated:

- **Status Snapshot:** Verify all sections reflect current reality. Flag any section that hasn't been updated in more than 4 weeks.
- **People Database:** Flag entries where `Last Updated` is more than 6 months old. Verify that `Current Situation` and `Last Known Contact` are still accurate for flagged entries.
- **Beliefs & Positions:** Check if any positions reference context that has since changed. Check if any active predictions should be resolved based on known outcomes.
- **Predictions:** Flag active predictions whose timeframe has elapsed without resolution.
- **Open Threads & Goals:** Flag threads and goals where `Last Referenced` is more than 30 days old — they may need resolution or an update.

### Relevance Check

Identify candidates for compression or removal:

- **People Database:** Entries that haven't been referenced in any journal entry for 6+ months and contain minimal context. Suggest tier demotion or removal.
- **Preferences & Reference Data:** Items that may no longer be current (a restaurant that closed, a drink order from a place the user no longer visits).
- **Chronicle:** No relevance check — Chronicle is append-only and permanent.

Present suggestions — The user decides what stays and what goes.

### Structural Check

For each file, evaluate:
- Has it grown unwieldy? Does any section need splitting?
- Is the organization still logical?
- Are there inconsistencies between files (e.g., a person's situation described differently in the People Database vs. the Status Snapshot)?

Minor fixes can be applied without asking. Major reorganization requires approval.

### Monthly Archival

Save a snapshot of all eight modular files to the archive:

```bash
MONTH=$(date +"%Y-%m")

for file in "Core Identity" "Status Snapshot" "People Database" "Chronicle" "Beliefs and Positions" "Predictions" "Open Threads and Goals" "Preferences and Reference Data"; do
    rclone copyto "gdrive:Claude/The Journal/System/${file}.md" \
        "gdrive:Claude/The Journal/System Archive/${MONTH}/${file}.md"
done

echo "Monthly archive saved to System Archive/${MONTH}/"
```

---

## Full Rebuild Fallback

Only run this if:
- Any modular file is missing from Google Drive, OR
- The user explicitly says "rebuild my encyclopedia from scratch" or similar

### Steps

1. List and read ALL files in both journal folders:
   ```bash
   rclone ls "gdrive:Claude/The Journal/Daily Entries/"
   rclone ls "gdrive:Claude/The Journal/Misc. Entries and Information/"
   ```
   Read every file.

2. Also read the existing compiled Encyclopedia if it exists — it serves as a valuable reference for the rebuild, especially for information that predates the journal entries:
   ```bash
   rclone cat "gdrive:Claude/The Journal/Encyclopedia.md"
   ```

3. Synthesize all eight modular files from scratch:
   - **Core Identity:** Extract permanent identity facts, values, education, career arc, family structure, social structure overview.
   - **Status Snapshot:** Determine current state across all domains from the most recent entries.
   - **People Database:** Create entries for every person with sufficient context. Create group entries for each distinct friend group. Assign tiers based on the full body of evidence.
   - **Chronicle:** Extract significant events from all entries. Date, title, tag, and describe each one.
   - **Beliefs & Positions:** Extract political worldview, all policy positions with their evolution (if traceable across entries), and admired figures.
   - **Predictions:** Extract all predictions, determine which are active vs. resolved.
   - **Open Threads & Goals:** Identify everything currently unresolved or actionable. Extract all goals.
   - **Preferences & Reference Data:** Extract all tastes, preferences, orders, sizes, favorites, memberships, and reference data.

   Apply the Durability Test to all content. When entries contradict each other, prefer the most recent. Flag ambiguous contradictions for the user.

4. Rebuild the Entry Index from scratch — one row per entry with date, topic summary, and People column (listing substantively discussed individuals per entry, using the same rules as Step 9).

5. Present all files for review before saving.

6. Save all files with `Last Updated: <today>`.

---

## Searching Past Entries

When the Update Skill needs to look up prior context (e.g., to verify a contradiction or trace an arc):

**Start with the Entry Index:**
```bash
rclone cat "gdrive:Claude/The Journal/Entry Index.md"
```

**Read specific entries:**
```bash
rclone cat "gdrive:Claude/The Journal/Daily Entries/YYYY-MM-DD.md"
rclone cat "gdrive:Claude/The Journal/Misc. Entries and Information/YYYY-MM-DD - Title.md"
```

**Claude.ai web / Claude app:**
Use the Google Drive connector to browse the appropriate subfolder under `Claude/The Journal/`.

---
**System rules:** If this skill or its supporting files are modified, follow the System Change Protocol in `CLAUDE.md` and the System Change Checklist in `~/.claude/docs/system.md`. All items are mandatory.
