# Backup System Refactor — Design

**Date:** 2026-03-22
**Status:** Approved
**Supersedes:** backup-system-refactor-design (03-20-2026) (closed PR #10/#11 — designed against pre-symlink-only codebase)

## Problem Statement

The DestinClaude backup system has four structural problems:

1. **Plugin directory blind spot.** `session-start.sh` trusts `config.json` without verifying the toolkit repo exists or is complete. On restore to a new device, the directory may be missing or broken — producing "vunknown" version, missing hooks, and no warning.

2. **Backup scope includes toolkit-owned files.** `git-sync.sh` backs up skills, hooks, specs, and commands that come from the public DestinClaude repo. These should never be backed up — they should be re-cloned. Backing them up wastes space, creates version conflicts on restore, and can overwrite freshly installed toolkit files.

3. **Three overlapping backup systems.** `git-sync.sh`, `personal-sync.sh`, and inline Drive archive logic have overlapping responsibilities, different backend assumptions, and independent debounce logic. The Drive archive is hardcoded in git-sync.sh rather than going through the backend-agnostic personal-sync path.

4. **No structural migration.** Backups mirror the user's local filesystem verbatim. If DestinClaude reorganizes files, restoring an old backup onto a new toolkit version creates mismatches with no migration path.

## Design Decisions

### D1: Two refactored scripts with shared library

**Decision:** Keep `git-sync.sh` and `personal-sync.sh` as separate scripts. Extract shared utilities (debounce, path normalization, logging, symlink detection) into `lib/backup-common.sh` that both source.

**Rationale:** The scripts serve genuinely different purposes — git-sync is about version control (commit/push/pull), personal-sync is about cross-device data replication. They have different triggers, operations, and failure modes. Merging into a single unified engine would create a 700+ line script doing two different jobs. Extracting shared bits into a library gets deduplication without losing separation of concerns.

**Alternatives rejected:**
- Unified backup-engine.sh (rejected: god-script doing two different jobs, harder to reason about failures)

### D2: Symlink detection for file ownership

**Decision:** Use symlink detection as an **additional** filter to determine whether a file is toolkit-owned. If a file is a symlink pointing into `TOOLKIT_ROOT`, it's toolkit-owned and never backed up. No plugin manifest needed. This supplements (not replaces) `.gitignore` filtering, which continues to handle exclusion of credentials, build artifacts, and other non-ownership concerns.

**Rationale:** The toolkit now requires symlink-based installs (copy fallback eliminated in v1.3.1). Symlinks are the authoritative signal for ownership. A plugin manifest adds maintenance burden for a problem that symlinks already solve.

**Alternatives rejected:**
- Plugin manifest JSON file (rejected: maintenance overhead, YAGNI since copies are eliminated)
- Both symlink + manifest (rejected: unnecessary redundancy)

### D3: Auto-repair legacy copies to symlinks

**Decision:** The session-start integrity check auto-repairs any toolkit files that are regular files (copies from pre-v1.3.1 installs) by replacing them with symlinks via `ln -sf`. This runs every session start.

**Rationale:** Makes symlink detection (D2) reliable for all users, including those who installed during the copy-based era. The current warn-only approach (telling users to run `/health`) leaves copies in place indefinitely. On Windows, sets `MSYS=winsymlinks:nativestrict` before creating symlinks.

**Safety check:** Before replacing a copy with a symlink, diff the copy against the toolkit source. If they differ (user modified the copy), warn the user and skip that file rather than silently overwriting. This preserves the toolkit's "non-destructive" mandate. Only identical copies are auto-repaired.

### D4: Drive archive absorbed into personal-sync

**Decision:** Remove inline Drive archive logic from `git-sync.sh`. All personal data replication — including what was previously "Drive archive" (specs, skills, CLAUDE.md snapshots) — flows through `personal-sync.sh` and goes to whichever backend(s) the user configured.

**Rationale:** The archive operation shouldn't be Drive-specific. Users who chose GitHub or iCloud as their backend should get the same archival behavior. Making personal-sync the single path for all backend replication eliminates the overlap between the two scripts.

### D5: Three equal backends — Drive, GitHub, iCloud

**Decision:** Support three backup backends as equal options:
- **Google Drive:** rclone sync to `gdrive:{DRIVE_ROOT}/Backup/personal/`
- **GitHub:** git operations to a private repo at `~/.claude/toolkit-state/personal-sync-repo/`
- **iCloud:** direct file copy to local iCloud Drive folder. Platform-specific paths — macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude/` (note: "Mobile Documents" contains a space — requires careful quoting). Windows: iCloud app folder, typically `~/iCloudDrive/` or `~/Apple/CloudDocs/` (Microsoft Store version). See icloud-backup-design (03-18-2026) for full path detection logic.

**Rationale:** Users should choose their backup destination based on their ecosystem, not based on what the toolkit supports. All three are common cloud storage options with different trade-offs.

**iCloud uses local folder operations, not rclone.** rclone's iCloud backend requires Apple ID session cookies that expire frequently, creating a bad re-auth experience. iCloud's value proposition is transparent local-folder sync — the OS handles cloud replication automatically. On Windows, the iCloud app must be installed and signed in; on macOS, the folder exists natively.

**Alternatives rejected:**
- rclone for iCloud (rejected: auth token expiry creates poor UX, fighting iCloud's native sync model)

### D6: Comma-separated multi-backend

**Decision:** Users can enable any combination of backends. `PERSONAL_SYNC_BACKEND` in config.json stores a comma-separated list (e.g. `"drive,github"`). Each sync cycle pushes to all configured backends. On restore, the user picks which backend to pull from. No hierarchy — all backends are equal mirrors.

**Rationale:** Most flexible option. Push is a loop over backends (simple). Restore is user-initiated (pick one source). Avoids the awkward "which is primary" decision that a primary/secondary model forces.

**Backend failure isolation:** If one backend fails during a sync cycle (e.g. Drive unreachable), log the error and continue to the next backend. One backend's outage should not prevent others from succeeding.

**Session-start pull ordering:** When multiple backends are configured, session-start pulls from the first configured backend only (leftmost in the comma-separated list). This is the "preferred pull source" — the user controls priority by ordering their backends. This avoids later pulls overwriting data from earlier ones. The GitHub backend's file copy uses `--update` semantics (skip if destination is newer) to prevent accidental overwrites.

### D7: Full migration framework

**Decision:** Backups include a `backup-meta.json` with schema version and toolkit version. The toolkit ships migration scripts in `core/hooks/migrations/` (one per version bump, e.g. `v1-to-v2.sh`). On restore, `lib/migrate.sh` reads the backup's schema version, compares to current, and runs each migration sequentially.

**Rationale:** Better to have migration infrastructure and not need it than to need it and not have it. Backup systems are the last place to cut corners on forward compatibility.

**Schema versioning:**
- Starts at v1 (current file layout as of this refactor)
- Bumped only when backup structure changes in a breaking way — not every toolkit release
- Schema version is independent of toolkit version (backup-meta.json tracks both)

**Migration file format:** Each migration file (e.g. `v1-to-v2.sh`) is a bash script that receives the restore directory as an argument and applies structural transformations — file renames, directory restructuring, config key changes. `v1.json` is a declarative manifest listing the expected file layout at schema v1, used by `migrate.sh` to validate completeness after migrations run.

**Edge cases:**
- No `backup-meta.json` (pre-refactor backup): treat as v0, run all migrations from start
- Migration failure: abort restore with clear error, don't leave user in half-migrated state
- Migrations are idempotent — running twice on already-migrated data is a no-op
- Backup schema version newer than toolkit's latest migration: abort restore with a message directing the user to update the toolkit first (`/update`). The toolkit cannot forward-migrate to a schema it doesn't know about.

### D8: Integrity check with user-prompted recovery

**Decision:** session-start.sh verifies toolkit integrity every session: directory exists, `.git` exists, `VERSION` exists, `plugin.json` exists, layer directories exist for installed layers. If any check fails, explain the problem and offer to fix it (clone from GitHub, reinstall symlinks). If user declines or is offline, continue in degraded mode with a warning.

**Rationale:** Auto-cloning a git repo is a meaningful action the user should consent to. Explaining the problem first builds trust. Degraded mode ensures the session isn't blocked by infrastructure issues.

**Note:** D8 (integrity check) prompts the user before taking action, while D3 (symlink auto-repair) acts automatically. The distinction: D8 handles catastrophic failures (missing repo) that require significant actions (git clone). D3 handles routine maintenance (copy→symlink) that is safe and idempotent, with the additional safeguard of diffing before replacing modified copies.

### D9: Conditional git pull on ~/.claude

**Decision:** Make the `git pull --rebase origin main` on `~/.claude/` conditional: only run it if a git remote is configured for the `~/.claude/` directory. This preserves cross-device sync for users who have it set up while not assuming all users have a git repo there.

**Rationale:** The `~/.claude/` git repo is user-configured, not toolkit-configured. Some users (like the toolkit author) use it for cross-device sync of settings.json, keybindings.json, history.jsonl, and other files outside personal-sync's scope. Removing it entirely would break their setup. Making it conditional keeps it as an opt-in mechanism for power users while the personal-sync system handles the standard cross-device path for most users.

**Relationship to personal-sync:** These are complementary, not overlapping. Personal-sync covers the universal personal data set (memory, CLAUDE.md, config, encyclopedia, custom skills). The optional `~/.claude/` git repo covers everything else a power user might want synced (settings.json, keybindings.json, installed_plugins.json, conversation transcripts, etc.). Users who only configure personal-sync get the essential files. Users who also set up a git repo get full cross-device parity.

### D10: Setup wizard restore and backend selection

**Decision:** Expand the setup wizard with:
- **Phase 0** revised: if returning user, ask which backend their backup is on (GitHub / Drive / iCloud / not sure)
- **Phase 0A/0B/0C:** Backend-specific restore sub-phases that pull data, run migrations, prompt for CLAUDE.md merge (merge / use backup / start fresh)
- **Phase 0D:** Abbreviated dependency check — verify only layers from restored config, skip personalization, go to verification
- **Phase 5 addition:** Backend multi-select for fresh installs ("Where would you like to back up your personal data?"), with backend-specific setup (rclone auth for Drive, repo URL for GitHub, iCloud folder detection)
- **`/restore` command:** Ad-hoc restore outside the wizard — same flow as Phase 0A/0B/0C with overwrite confirmation

## Architecture

### File Structure

```
core/hooks/
  git-sync.sh              — Git version control (commit, push, pull)
  personal-sync.sh         — Personal data replication to backends
  session-start.sh         — Session init (integrity check, pulls, health checks)
  write-guard.sh           — Concurrency protection (unchanged)
  lib/                     — NEW directory: shared utilities sourced by hooks
    backup-common.sh       — Shared utilities (debounce, path norm, logging, symlink detection)
    migrate.sh             — Backup schema migration runner
  migrations/              — NEW directory: schema migration scripts
    v1.json                — Initial schema definition (expected file layout at v1)
core/commands/
  restore.md               — /restore slash command (NEW)
```

**Sourcing safety:** Scripts that source `lib/backup-common.sh` check for its existence first and degrade gracefully if missing (e.g. during a partial update). This ensures backward compatibility during gradual rollout.

### Data Flow

**Push (on file write):**
```
File written → PostToolUse
  ├─ git-sync.sh
  │    → .gitignore filter (credentials, build artifacts)
  │    → skip if symlink into TOOLKIT_ROOT (toolkit ownership)
  │    → stage + commit to project git repo
  │    → update .write-registry.json
  │    → debounced push (15 min)
  └─ personal-sync.sh (if file matches personal data paths)
       → skip if symlink into TOOLKIT_ROOT
       → debounced sync (15 min) to ALL configured backends:
         ├─ Drive: rclone sync
         ├─ GitHub: git commit + push to private repo
         └─ iCloud: file copy to local iCloud folder
       → write backup-meta.json (schema version + toolkit version)
```

**Pull (on session start):**
```
session-start.sh → SessionStart
  → Toolkit integrity check (verify repo, auto-repair copies to symlinks)
  → Conditional git pull on ~/.claude (if git remote configured)
  → Pull personal data from first configured backend
  → Migration check (compare backup schema version, run migrations if needed)
  → Encyclopedia cache sync
  → Sync health check + statusline warnings
  → Version check, DestinTip selection
```

**Restore (setup wizard or /restore):**
```
User picks backend → pull data → migration check → CLAUDE.md merge prompt
  → merge: keep personal notes, update toolkit sections between markers
  → use backup: restore as-is
  → start fresh: keep wizard-generated version only
```

### Backup Scope

**Backed up by personal-sync (to Drive/GitHub/iCloud):**
- `~/.claude/projects/*/memory/` — user memory files
- `~/.claude/CLAUDE.md` — user instructions
- `~/.claude/toolkit-state/config.json` — toolkit configuration
- `~/.claude/encyclopedia/` — encyclopedia cache
- User-created skills (in `~/.claude/skills/` that aren't symlinks into toolkit)
- `backup-meta.json` — schema version + toolkit version stamp

**Backed up by git-sync (to git repos via tracked-projects.json):**
- Non-symlinked files in tracked project directories (filtered by .gitignore)

**Optionally backed up by ~/.claude git repo (power user opt-in):**
- settings.json, settings.local.json, keybindings.json
- installed_plugins.json, blocklist.json
- history.jsonl, conversation transcripts
- Any other non-toolkit files the user commits

**Never backed up:**
- Toolkit-owned files (symlinks into `TOOLKIT_ROOT`)
- `.write-registry.json`, `.push-marker`, `.sync-status`, `.sync-warnings` — ephemeral state
- Credentials, `.env` files, anything in `.gitignore`

## Dependencies

- **Depends on:** rclone (Drive backend), git (GitHub backend), iCloud app on Windows (iCloud backend)
- **Modifies:** git-sync.sh, personal-sync.sh, session-start.sh, setup wizard SKILL.md, backup-system-spec.md, personal-sync-spec.md, destinclaude-spec.md
- **Creates:** lib/backup-common.sh, lib/migrate.sh, migrations/v1.json, commands/restore.md

## Migration from Current System

- git-sync.sh inline Drive archive logic removed — personal-sync handles all backend replication
- The `~/.claude/` git pull made conditional (only if remote configured) — not removed
- Legacy copy-based files auto-repaired to symlinks on first session start after update (with diff check for modified copies)
- Existing `PERSONAL_SYNC_BACKEND` config values continue to work (single value treated as one-element list)
- Users with no backend configured see a setup prompt on first session start after update
