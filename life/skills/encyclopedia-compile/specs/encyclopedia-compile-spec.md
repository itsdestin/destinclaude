# Encyclopedia Compile — Spec

**Version:** 1.1
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/encyclopedia-compile/`

## Purpose

The Encyclopedia Compile skill reads all eight modular source files from the local encyclopedia cache (`~/.claude/encyclopedia/`) and produces the user's Encyclopedia — a single, narratively coherent life history document written in third-person biographical prose. The compiled output is the primary human-readable artifact of the entire Encyclopedia system, designed to be read as a comprehensive biography both now and decades from now. It supports four detail levels (Full, Personal, Professional, Public) that control how much intimate personal detail appears. The compilation is an editorial act: the eight source files are internalized as raw material and then rewritten into a unified document where no section maps one-to-one to any single source file.

## User Mandates

- **(2026-03-13) Approval gate — never save without explicit approval.** The compiled Encyclopedia and all modular source files must NEVER be written/saved to Google Drive without the user's explicit approval of the specific changes. Before saving, present a clear summary of all proposed additions, modifications, and removals, then wait for approval. This applies regardless of how the compilation was triggered.
- **(2026-03-13) Encyclopedia Archive Rule — every save produces an archive copy.** Every time the compiled Encyclopedia is saved to Google Drive, a timestamped archive copy MUST also be saved to `gdrive:Claude/The Journal/Encyclopedia Archive/Encyclopedia (${DATETIME}).md`. The primary save and archive save are one atomic operation — never do one without the other. Verify the archive exists after saving.
- **(2026-03-13) No bullet lists in narrative body.** Sections I–VI are prose-only. No bullet lists permitted in the narrative body.
- **(2026-03-13) All text must be black.** No gray, no muted colors, no HTML color tags, no inline styles, no formatting patterns that commonly render as gray (`<sub>`, `<sup>`, or other HTML elements).
- **(2026-03-13) Quotes use italic only.** Direct quotes always use italic `*` formatting. Never blockquote `>` style.
- **(2026-03-13) Subsection headers must be evocative and descriptive.** No generic headers like "Career Decision" — use descriptive alternatives like "The $85k Question" or "The Pines."
- **(2026-03-13) Default detail level is Full.** If the user does not specify a detail level, compile at Full. Ask which level to use before compilation unless they specify upfront.
- **(2026-03-13) Completeness requirement.** Every People Database entry must appear in the People Index. Every significant Chronicle event must appear in the Timeline. People mentioned in the narrative body must appear in the People Index.
- **(2026-03-13) Narrative quality over length management.** If context window constraints require splitting, compress appendices first. The narrative body is the soul of the document and must not be sacrificed.
- **(2026-03-13) Self-review before saving.** Perform a full consistency review pass (visual/formatting, stylistic, completeness) after compilation and before saving. Fix issues silently — do not present findings for approval, just fix them.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Eight modular source files as input, single compiled doc as output | Separates maintenance (small, frequent file updates) from the reading experience (unified biography). Modular files are easy to update; compiled doc is easy to read. | Single monolithic file maintained directly; section-by-section files published individually |
| Third-person honest narrator voice | Creates a biographical document that reads as a story rather than a self-portrait or resume. Avoids self-aggrandizement while remaining warm and engaged. | First-person journal style; clinical third-person; omniscient narrator |
| Four detail levels with filtering rules | Enables sharing subsets of the Encyclopedia (e.g., Professional level for a colleague) without maintaining separate documents. Single compilation flow with conditional inclusion. | Separate documents per audience; redaction after the fact; single level only |
| Editorial compilation rather than mechanical assembly | Prevents the output from reading as eight concatenated files. Cross-pollination of sources within each section produces a cohesive narrative. | Template-based merge; section-per-file mapping; automated concatenation |
| Appendices as structured reference, narrative body as prose | Different content types serve different reading modes. Narrative for understanding; appendices for lookup. Keeps the biography readable while preserving reference utility. | All prose; all structured data; hybrid format throughout |
| Archive copy on every save | Provides a complete version history of the Encyclopedia over time. Enables comparison between compilations and protects against accidental overwrites. | Git-style versioning; single file with change log; no archiving |
| Pre-save approval gate | The Encyclopedia contains deeply personal content. Prevents accidental publication of incorrect or unwanted content. | Auto-save with undo; save first then review; approval only for Public-level |
| Self-review pass before saving | Catches formatting inconsistencies, missing entries, and voice drift without burdening the user with a checklist. | Manual checklist presented to user; no review; external linter |

## Current Implementation

### Invocation

Triggered when the user says "compile my encyclopedia," "build the encyclopedia," "generate the full encyclopedia," "put it all together," or similar. Can also run on a scheduled basis (monthly after the monthly review) or at natural transition points (graduation, job change, end of year).

### Pre-Compilation: Read All Source Files

The skill reads all eight modular source files from the local encyclopedia cache (`~/.claude/encyclopedia/`) via the Read tool:

1. **Core Identity.md** — Permanent identity facts, origin story, values, career arc
2. **Status Snapshot.md** — Present-tense portrait of current state across all life domains
3. **People Database.md** — All people and groups with tier assignments, relationship details
4. **Chronicle.md** — Append-only log of significant life events with severity and arc tags
5. **Beliefs and Positions.md** — Political worldview, policy positions, evolution tracking
6. **Predictions.md** — Predictions lifecycle (active and resolved)
7. **Open Threads and Goals.md** — Active threads, goals, recently resolved items
8. **Preferences and Reference Data.md** — Lookup/reference data (food orders, tech setup, media, sizes)

On Claude.ai web/app, files are opened via the Google Drive connector instead of rclone.

### Detail Level Selection

Before compilation, the skill asks the user which of four detail levels to use (unless specified upfront):

| Level | Label | Includes | Filters Out |
|-------|-------|----------|-------------|
| 1 | **Full** (default) | Everything, unfiltered | Nothing |
| 2 | **Personal** | Personal life included but softened | Specific fights (→ "tensions"), detailed depression episodes, specific substance use details, raw financial numbers |
| 3 | **Professional** | Career, education, philosophy, skills, surface-level personal context | Relationship conflicts, mental health details, substance use, financial specifics, intimate dynamics |
| 4 | **Public** | Only what a stranger could comfortably read | All above + relationship details beyond "in a relationship," friend group dynamics, sensitive biographical details |

When not at Full level, a `*Detail Level: [level]*` line is added to the document header.

### Compilation: Editorial Synthesis

The compilation is an editorial act. The eight source files are internalized as raw material, then the Encyclopedia is written as a unified document following the fixed output structure:

**Document Header** — Title, compilation date, source-files-last-updated date, optional detail level.

**Table of Contents** — Reflects every `##` and `###` heading. Updated to match actual structure on every compilation.

**Narrative Body (Sections I–VI):**

- **I. Identity & Background** — Origin story, childhood, family, values, formative events. Draws from Core Identity, Chronicle, People Database.
- **II. Education** — Academic arc from early schooling through current/most recent program. Draws from Core Identity.
- **III. Career** — Full professional timeline as narrative, current role in depth, future direction. Draws from Core Identity, Status Snapshot, Chronicle, People Database.
- **IV. Political Philosophy** — Worldview, theory of change, policy positions with evolution, prediction track record synthesized as judgment patterns. Draws from Beliefs & Positions, Predictions.
- **V. Relationships & Social Life** — Partner (full relationship portrait), friend groups as social units, family, other notable relationships. Draws from People Database, Core Identity, Status Snapshot, Chronicle.
- **VI. Lifestyle** — Finances, health, interests, habits, what's currently active. Draws from Status Snapshot, Core Identity, Chronicle.

Each section draws from multiple source files. No section maps one-to-one to a single file. The test: if a reader could identify which modular file supplied a paragraph, the compilation failed.

**Appendices:**

- **A. People Index** — Structured reference for every person, organized by relationship category (Partner, Family, Friends by tier, Colleagues, Partner's Circle). Every People Database entry included; sparse entries stay sparse.
- **B. Timeline** — Chronological list of major/notable Chronicle events. One line per event, grouped by year. Includes upcoming known milestones.
- **C. Tastes & Preferences** — Lookup data organized by category (Food & Drink, Restaurants, Media, Tech, Social Spots, Anti-Preferences). Tables and lists, no narrative.
- **D. Quick Reference** — Practical utility data (contact info, clothing sizes, membership numbers, date ideas). Tables and concise lists.

### Handling Long Documents

If context window constraints prevent writing the entire document in one pass:
1. Write narrative body (Sections I–VI) first as a complete unit.
2. Write appendices separately.
3. Combine into the final document.

Appendices are compressed before narrative body if length is constrained.

### Post-Compilation: Quality Checks

A self-review pass checks three categories before saving:

**Visual & Formatting:** Header hierarchy consistency, italic quotes (no blockquotes), table alignment, date formatting, bold/italic conventions, all-black text, TOC accuracy.

**Stylistic:** Consistent narrator voice across sections, no bullet lists in narrative body, evocative subsection headers, subtle editorializing, balanced quote usage.

**Completeness:** All People Database entries in People Index, all narrative-body people in People Index, all significant Chronicle events in Timeline, consistent People Index entry format.

Issues are fixed silently — not presented for approval.

### Post-Compilation: Save

**Approval gate:** Present a summary of the compilation to the user and wait for explicit approval before saving.

**Atomic save operation (Claude Code CLI):**
1. Write compiled content to `/tmp/encyclopedia.md`.
2. `rclone copyto` to primary path: `gdrive:Claude/The Journal/Encyclopedia.md`.
3. `rclone copyto` to archive path: `gdrive:Claude/The Journal/Encyclopedia Archive/Encyclopedia (${DATETIME}).md` where `DATETIME` is formatted as `MM-DD-YYYY @ TIMEam/pm`.
4. Verify both saves succeeded. If either fails, preserve `/tmp/encyclopedia.md` and report the error.
5. Clean up temp file on success.

**On Claude.ai web/app:** Render the full compiled Encyclopedia as formatted markdown and instruct the user to save manually.

**Confirmation:** Brief confirmation noting date and which modular files were sourced. No detailed summary unless asked.

## Dependencies

- **Depends on:**
  - `encyclopedia-update` skill — maintains the 8 modular source files that serve as compilation input
  - `rclone` with `gdrive:` remote configured — for writing compiled output and archive to Google Drive
  - Local encyclopedia cache at `~/.claude/encyclopedia/` — modular source files read from local cache
  - Google Drive folder structure: `gdrive:Claude/The Journal/System/` (source), `gdrive:Claude/The Journal/` (output), `gdrive:Claude/The Journal/Encyclopedia Archive/` (archive)
  - `journaling-assistant` skill — journal sessions feed updates to modular files which then feed compilation

- **Depended on by:**
  - `encyclopedia-librarian` skill — searches the compiled Encyclopedia as one of its sources
  - Any workflow that references the user's Encyclopedia as a biographical resource

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec documenting full compilation flow, detail levels, editorial guidelines, save protocol, archive rule, and approval gate | New | User |
| 2026-03-15 | 1.1 | Updated modular file read paths from Drive to local encyclopedia cache per Git + Drive hybrid migration | Implementation | User |
