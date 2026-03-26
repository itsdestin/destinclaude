# Cross-Device Sync — Design

**Date:** 2026-03-25
**Status:** Approved
**Supersedes:** PR #61 (feat/cross-device-sync) — incorporates its config split plus conversation sync and aggregation

## Problem Statement

Three compounding issues prevent cross-device continuity:

1. **Config conflicts:** `config.json` contains machine-specific values (toolkit_root, platform, binary paths) that break when synced to another device.
2. **Conversations not synced:** Personal-sync classifies sessions as "ephemeral runtime state" and excludes them. git-sync would track `.jsonl` files but `~/.claude` is never initialized as a git repo by the setup wizard.
3. **No unified /resume:** Claude Code's `/resume` only scans the current project slug. Conversations from other projects or devices are invisible.

Additionally, specs incorrectly frame git-sync as "primary" and personal-sync as "secondary." All backends (Drive, GitHub, iCloud) should be equal.

## Target Platforms

Windows, macOS, Linux, Android (Termux). All code paths must account for:
- Android: no `rsync` (use `cp -r`), unusual storage paths (`/data/data/com.destin.code/files/home`), symlinks work in Termux
- Windows: requires `MSYS=winsymlinks:nativestrict` for symlinks, requires Developer Mode
- macOS/Linux: standard behavior

## Design Decisions

| ID | Decision | Rationale | Alternatives considered |
|----|----------|-----------|------------------------|
| D1 | Portable/local config split | `config.json` holds portable user preferences (synced). `config.local.json` holds machine-specific values (platform, toolkit_root, binary paths) — rebuilt by session-start every session. `config_get()` reads local first, portable second. Eliminates cross-device conflicts. | Key-level merge during sync (complex bash merge logic), environment variables (not persistent), template with placeholders (adds build step). |
| D2 | mcp-config.json excluded from sync | Contains absolute paths and platform-specific MCP servers. Each device rebuilds its own from `.claude.json`. Excluded from personal-sync (early exit) and git tracking. **Reversal of existing backup-system-spec decision** (v4.2 line 122: "MCP servers \| */mcp-servers/* (includes mcp-config.json)"). Rationale: mcp-config.json contains absolute paths that differ per device; committing it causes merge conflicts and overwrites the local device's MCP configuration. The extraction from `.claude.json` already runs every session-start, so the file is always rebuilt locally. | Sync with path rewriting (fragile), per-platform config files (proliferation). |
| D3 | Conversations added to personal-sync scope | `.jsonl` session transcripts are valuable personal data, not ephemeral state. Pushed per-slug (`conversations/{slug}/{session-id}.jsonl`) to all backends. Pulled on session-start. Uses `rclone copy --checksum` for Drive conversations specifically (append-only files where mtime is unreliable cross-platform). Other personal-sync categories (memory, encyclopedia, skills) continue using `--update` — their files are small, rarely modified, and mtime is reliable enough. Conversations are the exception because they grow by append during active sessions. | Keep in git-sync only (requires git repo, not all users have one), flat directory (loses project origin). |
| D4 | Per-slug conversation structure on backends | Conversations stored as `{backup-root}/conversations/{slug}/{session-id}.jsonl`. Preserves project origin. Enables project-specific `/resume` and selective pull. Mirrors legacy `gdrive:Claude/Backup/conversations/` structure. | Flat pool (loses project origin, harder to reason about), per-device directories (wrong grouping — projects span devices). |
| D5 | Home-directory conversation aggregation | `aggregate_conversations()` in backup-common.sh symlinks all `.jsonl` files from all project slugs into the home-directory slug. Runs on session-start after conversation pull. Makes `/resume` from `~` show all conversations regardless of origin project. Only aggregates into the home slug — launching from a project directory shows that project's conversations only. | Copy files (wastes disk, breaks append propagation), modify Claude Code (can't), separate index tool (adds UX friction), bidirectional aggregation (complex, unclear benefit). |
| D6 | Relative symlinks for aggregation | Symlinks use relative paths (e.g., `../{origin-slug}/{session-id}.jsonl`) for portability — absolute paths break when home directory differs across devices. Requires Developer Mode on Windows (already required by setup wizard). `MSYS=winsymlinks:nativestrict` must be set globally in `aggregate_conversations()`, not just in the auto-repair block. | Hard copies (doubles storage, edits don't propagate), junction points on Windows (different semantics), absolute symlinks (break cross-device). |
| D7 | All backends are equal | No "primary" or "secondary" designation. Drive, GitHub, iCloud, and git-sync are complementary systems with different scopes. A user with only Drive has full sync. A user with only git has full sync. Specs corrected to remove priority language. Rename `get_primary_backend()` to `get_preferred_backend()` — reflects that session-start pulls from one backend to avoid race conditions, not because it's "primary." | Keep git as primary (excludes Drive/iCloud-only users, creates false dependency). |
| D8 | Git repo health check, not requirement | Session-start warns if `GIT_REMOTE` is configured but `~/.claude/.git` doesn't exist. `/sync` offers to fix it. git-sync bails early with a log warning if no repo. But git is not required — personal-sync provides full functionality independently. | Require git (excludes non-technical users), silent failure (current broken state). |
| D9 | Legacy conversation migration (idempotent, marker-gated) | One-time `rclone copy` (not `move`) from `gdrive:Claude/Backup/conversations/` to `gdrive:Claude/Backup/personal/conversations/`. Gated by marker file `~/.claude/toolkit-state/.legacy-conversations-migrated`. After copy completes and marker is written, the legacy directory is left in place (other devices may not have updated yet). A future cleanup step can remove it after all devices are migrated. | `rclone move` (destructive if interrupted, breaks unmigrated devices), no migration (two locations forever). |

## Component Changes

### backup-common.sh

- Add `LOCAL_CONFIG_FILE` constant pointing to `~/.claude/toolkit-state/config.local.json`
- `config_get()`: read `config.local.json` first, then `config.json`; local takes precedence
- Rename `get_primary_backend()` → `get_preferred_backend()` (D7)
- New function: `aggregate_conversations(projects_dir)`
  - Determines home slug via `get_current_project_slug()`
  - Sets `MSYS=winsymlinks:nativestrict` on Windows
  - Iterates non-home slug directories under `projects/`
  - **Skips slug directories that are themselves symlinks** (foreign device slugs from `rewrite_project_slugs()`) to prevent symlink loops
  - For each real `.jsonl` file in non-home slugs: if not already present in home slug (as real file or symlink), creates relative symlink
  - Cleans up dangling symlinks in home slug (target no longer exists)

### session-start.sh

- New: `rebuild_local_config()` — detects platform, toolkit_root, binary paths; writes `config.local.json`. **Runs before any config reads** to ensure `config_get()` always has fresh local values
- New: one-time config migration — strips machine-specific keys from `config.json` AND immediately pushes the cleaned `config.json` to the preferred backend. This prevents the next pull from re-introducing stale values
- Stop git-committing `mcp-config.json`; add to `.gitignore`; add `config.local.json` to `.gitignore`
- New: conversation pull from preferred backend (after existing personal data pull). Command: `rclone copy --checksum "$DRIVE_SOURCE/conversations/" "$CLAUDE_DIR/projects/"` — the per-slug directory structure maps directly, stripping the `conversations/` prefix because the rclone source path ends at it
- New: legacy conversation migration (D9), gated by marker file `~/.claude/toolkit-state/.legacy-conversations-migrated`
- New: call `aggregate_conversations()` after slug rewriting
- New: `GIT:NOT_INITIALIZED` warning if `GIT_REMOTE` set but no `.git`
- Rename `get_primary_backend()` calls → `get_preferred_backend()`

### personal-sync.sh

- Early exit for `config.local.json` and `mcp-config.json` paths — never pushed
- New path filter: `*/projects/*/*.jsonl` triggers sync
- New category in `sync_drive()`, `sync_github()`, `sync_icloud()`: push conversations per-slug
  - Drive uses `rclone copy --checksum` (D3 rationale)
  - GitHub backend uses `cp`
  - iCloud uses `rsync -a --update` (macOS only; Android falls back to `cp -r`)
- Skip slug directories that are symlinks (foreign device slugs — avoids pushing aliased data)

### git-sync.sh

- Early bail with `log_backup "WARN"` if `$REPO_DIR/.git` doesn't exist (not silent, not spammy)

### statusline.sh / post-update.sh

- Read `toolkit_root` from `config.local.json` first, fall back to `config.json`

### Setup wizard

- New Phase 5 step: initialize `~/.claude` as git repo if `GIT_REMOTE` is set
- Express/beginner path: skip (matches current default of `GIT_REMOTE: "none"`)

### .gitignore updates (for ~/.claude repo, when it exists)

- Add `toolkit-state/config.local.json`
- Add `mcp-servers/mcp-config.json`

### Spec updates

- `backup-system-spec.md` v4.2 → v4.3:
  - Remove primary/secondary language throughout
  - Rename `get_primary_backend()` → `get_preferred_backend()`
  - Add D1 (config split), D2 (mcp exclusion — document as reversal of v4.2 decision), D8 (git health check) to design decisions table
  - Add `config.local.json` to state files table
  - Update mcp-servers tracked files row to note `mcp-config.json` exclusion
- `personal-sync-spec.md` v2.1 → v2.2:
  - Add conversations to synced data table with per-slug structure
  - Remove "sessions" from "ephemeral runtime state" exclusion list (keep shell-snapshots, tasks)
  - Add `conversations/{slug}/` to all backend structure diagrams
  - Document `aggregate_conversations()` and its session-start integration
  - Add D2 (machine-specific exclusion) and D9 (legacy migration) as design decisions
  - Document `--checksum` rationale for conversations vs `--update` for other categories

## Sync Flow (end-to-end)

### Push (personal-sync.sh, every 15 min on Write/Edit)

```
~/.claude/projects/{slug}/*.jsonl
    ↓ (for each non-symlink slug directory)
gdrive:Claude/Backup/personal/conversations/{slug}/{session-id}.jsonl
    (rclone copy --checksum)
```

### Pull (session-start.sh, every session)

```
gdrive:Claude/Backup/personal/conversations/
    ↓ rclone copy --checksum → ~/.claude/projects/
    ↓ (maps conversations/{slug}/*.jsonl → projects/{slug}/*.jsonl)
~/.claude/projects/{slug}/*.jsonl
    ↓ (aggregate_conversations — only into home slug)
~/.claude/projects/{home-slug}/{session-id}.jsonl → ../{origin-slug}/{session-id}.jsonl
    ↓
/resume from ~ sees all conversations
```

### Resume from different directories

```
Device A (Windows, ~):     claude → /resume → sees ALL conversations (aggregated)
Device B (Mac, ~):         claude → /resume → sees ALL conversations (aggregated)
Device B (Mac, ~/code):    claude → /resume → sees ~/code conversations only
```

Aggregation is one-directional: all slugs → home slug. Project-specific directories are not polluted with unrelated conversations.

## File Structure on Backends

```
{backup-root}/
├── memory/{slug}/              # existing
├── CLAUDE.md                   # existing
├── toolkit-state/config.json   # existing (now portable-only)
├── encyclopedia/               # existing
├── skills/                     # existing
├── backup-meta.json            # existing
└── conversations/              # NEW
    ├── C--Users-alice/
    │   ├── 915c4e14-....jsonl
    │   └── 06ef9649-....jsonl
    ├── C--Users-alice-myproject/
    │   └── ecfe89a9-....jsonl
    └── C--Users-alice-destinclaude-desktop/
        ├── 239eedf3-....jsonl
        └── 078d7e44-....jsonl
```

## Scale Considerations

- Current local: 17 MB (10 conversations)
- Legacy Drive: 638 MB (~1,250 conversations)
- Growth: conversations are append-only, typically 100 KB–7 MB each
- Debounce: 15 minutes prevents excessive uploads during active sessions
- `--checksum`: only uploads files whose content actually changed
- `rclone copy` (not `sync`): never deletes remote files not present locally
- **First pull on new device:** Downloads all conversations from the preferred backend. For a user with 638 MB of history, this could take several minutes on a slow connection. Acceptable for a one-time setup — subsequent pulls are incremental. Session-start should log progress (e.g., "Pulling conversations from Drive...") so the user knows it's working.
- **Legacy migration:** `rclone copy` (not `move`) to preserve data for unmigrated devices. Marker-gated so it runs exactly once per device. Legacy directory persists until manual cleanup or future automated removal after all devices confirm migration.
