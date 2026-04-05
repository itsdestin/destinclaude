# Memory System — Spec

**Version:** 1.2
**Last updated:** 2026-04-05
**Feature location:** `~/.claude/projects/{project-key}/memory/`

## Purpose

The memory system gives Claude Code persistent context about the user across conversations. It is a flat directory of small Markdown files, organized by type and indexed in `MEMORY.md`. Each file captures one discrete fact, preference, correction, or reference that Claude should recall without the user having to repeat it. The system is built into Claude Code's auto-memory feature — there is no custom skill; Claude reads and writes these files directly.

## User Mandates

- (2026-03-13) Memory files must use YAML frontmatter with `name`, `description`, and `type` fields.
- (2026-03-13) `MEMORY.md` is the authoritative index — every memory file must be listed there with a one-line description.
- (2026-03-13) Files are grouped into four categories: **User** (identity/preferences), **Feedback** (corrections to Claude's behavior), **Project** (project-specific config/context), **Reference** (API keys, tool usage, external service details).
- (2026-03-13) File naming follows the pattern `{type}_{slug}.md` (e.g., `feedback_plan_location.md`, `reference_todoist.md`).
- (2026-03-13) Biographical, relationship, political, and life-history detail belongs in the Encyclopedia system files on Google Drive — NOT in local memory. Memory is for operational context only.
- (2026-03-13) Do not store secrets (API tokens, passwords) directly in memory files. Store the *location* of the secret (e.g., "token is managed by MCP server config").
- (2026-03-13) Each memory file should be small and single-purpose — one topic per file, not a catch-all dump.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Flat directory, no subdirectories | Simplicity; started with ~8 files, currently at ~14, unlikely to exceed ~25 | Nested folders per type — rejected as over-engineering |
| YAML frontmatter on each file | Machine-readable metadata (name, type, description) without a separate manifest | JSON sidecar files; single large YAML file |
| `MEMORY.md` as human-readable index | Quick orientation for Claude at session start; also serves as table of contents for the user | Auto-generated index — rejected because manual curation keeps it clean |
| Encyclopedia pointer section in `MEMORY.md` | Prevents duplication; biographical detail lives in one authoritative place (Google Drive) | Copying encyclopedia excerpts into local memory — rejected to avoid drift |
| Prefix-based naming (`type_slug.md`) | Enables instant recognition of file purpose; sorts naturally by category | Tags in frontmatter only — harder to scan in a directory listing |

## Current Implementation

- **Index:** `MEMORY.md` lists all files grouped under `## User`, `## Feedback`, `## Project`, `## Reference`, and `## Encyclopedia (Google Drive)`.
- **Files (13 total):**
  - `user_profile.md` — Name, role, education, location, partner, emails.
  - `user_preferences.md` — Interaction preferences and past corrections.
  - `feedback_context_critic_rigor.md` — Meaning-fidelity check for paraphrased quotes.
  - `feedback_plan_location.md` — Save spec/plan docs in the skill's own folder.
  - `feedback_chimes_notification.md` — Play chimes when needing input or done.
  - `feedback_pdftotext_bash.md` — pdftotext is in Git bash PATH only.
  - `feedback_librarian_detail_level.md` — Always ask detail level before reports.
  - `feedback_spec_updates_with_implementation.md` — Read specs at start of work.
  - `feedback_title_case_ui.md` — All UI text must use Title Case.
  - `feedback_research_before_building.md` — Research existing solutions first.
  - `project_gmail_mcp.md` — Gmail-extended MCP server (DEPRECATED; removed from toolkit).
  - `reference_todoist.md` — Todoist configuration and MCP setup.
  - `reference_gemini_cli.md` — How to launch Gemini CLI.
- **Read/write mechanism:** Claude Code's built-in auto-memory. Claude reads `MEMORY.md` at session start (via system prompt injection) and can create/edit memory files with standard Write/Edit tools.
- **Backup:** Memory files are synced to configured backends via `sync.sh`.

## Dependencies

- **Depends on:** Claude Code's built-in memory system (reads `MEMORY.md` into context); `sync.sh` hook for backend sync.
- **Depended on by:** All skills and workflows that need persistent user context (journaling, encyclopedia, writing voice, and optional domain-specific modules). The Encyclopedia system on Google Drive is the canonical store for biographical detail — memory just points to it.

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec | New | — |
| 2026-03-15 | 1.1 | Updated file list (8→14), fixed stale sync-to-drive.sh references to git-sync.sh | Revised | — | |
| 2026-04-05 | 1.2 | Sync consolidation: updated git-sync.sh references to sync.sh in backup description and dependencies. | Update | owner | |
