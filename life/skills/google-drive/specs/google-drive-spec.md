# Google Drive — Spec

**Version:** 1.1
**Last updated:** 2026-03-15
**Feature location:** `~/.claude/skills/google-drive/`

## Purpose

A lightweight wrapper skill that routes all Google Drive operations through `rclone` with the `gdrive:` remote. It provides a command reference for listing, uploading, downloading, moving, deleting, and syncing files, ensuring Claude never falls back to browser automation, MCP tools, or the Drive web UI. The skill is invoked any time the user mentions Google Drive, gdrive, or any Drive file operation.

## User Mandates

- **(2026-03-13)** The configured remote MUST always be `gdrive:` — all paths are prefixed with `gdrive:`. No other remote name is permitted.
- **(2026-03-13)** Never use browser automation, MCP tools, or the Drive web UI for Google Drive operations — rclone only.
- **(2026-03-13)** Use `--dry-run` before any destructive operation (`move`, `sync`, `purge`) to preview changes.
- **(2026-03-13)** Paths with spaces must be quoted (e.g., `"gdrive:My Folder/file.txt"`).

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Use rclone exclusively | Reliable CLI tool with existing auth; avoids flaky browser automation | Google Drive API via Python, Playwright-based Drive UI interaction |
| Single `gdrive:` remote name | Convention shared across all skills and hooks (backup, journaling, encyclopedia) | Per-skill remotes, multiple named remotes |
| Wrapper skill (no custom code) | rclone already handles all operations; skill just provides the reference and trigger rules | Custom Node/Python script wrapping the Drive API |

## Current Implementation

Simple SKILL.md (82 lines) containing:
- Frontmatter trigger rules (activates on any Google Drive / gdrive mention)
- `gdrive:` remote naming convention
- Command reference: `ls`, `lsd`, `lsf`, `mkdir`, `copy`, `moveto`, `move`, `deletefile`, `purge`, `sync`, `check`, search
- Tips for safe usage (`--dry-run`, `--progress`, quoting)

No custom scripts, no build step, no external dependencies beyond rclone.

## Dependencies

- **Depends on:** `rclone` (installed and configured with `gdrive:` remote and valid Google OAuth tokens)
- **Depended on by:**
  - `git-sync.sh` hook (Drive archive uses `rclone copy` with `gdrive:`)
  - `journaling-assistant` (saves daily entries to `gdrive:Claude/The Journal/`)
  - `encyclopedia-update` / `encyclopedia-compile` (write modular files to Drive after local cache updates, write compiled encyclopedia to Drive)
  - `encyclopedia-librarian` (reads journal entries and system files from Drive)
  - `skill-creator` (backup snapshots include skills via the hook)

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec | New | Destin |
| 2026-03-15 | 1.1 | Updated hook references (sync-to-drive/sync-from-drive → git-sync.sh), updated encyclopedia dependency descriptions for local cache migration | Implementation | Destin |
