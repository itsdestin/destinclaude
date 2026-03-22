# Backup System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the backup system to fix four structural problems: plugin directory blind spot, toolkit files in backups, overlapping scripts, and no migration framework. Add iCloud as a third backend alongside Drive and GitHub.

**Architecture:** Two focused scripts (`git-sync.sh` for version control, `personal-sync.sh` for data replication) with shared utilities in `lib/backup-common.sh`. Symlink detection classifies file ownership. Full migration framework with schema-versioned backups. Setup wizard expanded with restore flows for all three backends.

**Tech Stack:** Bash (hooks), Node.js (config parsing), rclone (Drive), git (GitHub), local file copy (iCloud)

**Design doc:** `core/plans/backup-system-refactor-design (03-22-2026).md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `core/hooks/lib/backup-common.sh` | Shared utilities: debounce, path normalization, logging, symlink ownership detection |
| `core/hooks/lib/migrate.sh` | Backup schema migration runner |
| `core/hooks/migrations/v1.json` | Initial schema definition (expected file layout at v1) |
| `core/commands/restore.md` | `/restore` slash command for ad-hoc restores |

### Modified Files
| File | Current Lines | Changes |
|------|--------------|---------|
| `core/hooks/git-sync.sh` | 245 | Remove Drive archive (lines 213-232), add symlink filter, source lib/backup-common.sh |
| `core/hooks/personal-sync.sh` | 222 | Expand scope, add iCloud backend, multi-backend loop, backup-meta.json writing |
| `core/hooks/session-start.sh` | 485 | Integrity check, auto-repair copies, conditional git pull, multi-backend pull, migration check |
| `core/skills/setup-wizard/SKILL.md` | 1432 | Add Phase 0C (iCloud restore), Phase 5 backend multi-select |
| `core/specs/backup-system-spec.md` | — | v3.3 → v4.0 |
| `core/specs/personal-sync-spec.md` | — | v1.1 → v2.0 |
| `core/specs/destinclaude-spec.md` | — | v2.5 → v2.6 |
| `core/specs/INDEX.md` | — | Version bumps |
| `docs/system-architecture.md` | — | Add lib/ directory, migration framework, updated hook descriptions |
| `core/commands/update.md` | — | Add lib/ and migrations/ to refresh scope |
| `core/commands/health.md` | — | Add migration check, backend health verification |

---

## Task 1: Create shared library (`lib/backup-common.sh`)

**Files:**
- Create: `core/hooks/lib/backup-common.sh`

This is the foundation — every other task depends on it.

- [ ] **Step 1: Create the lib/ directory and backup-common.sh**

```bash
#!/usr/bin/env bash
# backup-common.sh — Shared utilities for backup hooks
# Sourced by git-sync.sh, personal-sync.sh, session-start.sh
# Design ref: backup-system-refactor-design (03-22-2026).md D1

# NOTE: Do not set shell options (set -euo pipefail) in sourced libraries.
# All callers already set these. Changing them here would affect the caller's
# error handling if they ever diverge.

# --- Constants ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TOOLKIT_ROOT="${TOOLKIT_ROOT:-}"
BACKUP_LOG="$CLAUDE_DIR/backup.log"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"

# --- Logging ---
log_backup() {
    local level="$1" msg="$2"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] [$level] $msg" >> "$BACKUP_LOG"
    if [[ "$level" == "ERROR" ]]; then
        echo "{\"hookSpecificOutput\": \"Backup: $msg\"}" >&2
    fi
}

# --- Config reading ---
# Read a key from config.json. Falls back to grep if node unavailable.
config_get() {
    local key="$1" default="${2:-}"
    if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
        local val
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Grep fallback
    if [[ -f "$CONFIG_FILE" ]]; then
        grep -oP "\"$key\"\\s*:\\s*\"\\K[^\"]*" "$CONFIG_FILE" 2>/dev/null || echo "$default"
    else
        echo "$default"
    fi
}

# --- Symlink ownership detection (Design ref: D2) ---
# Returns 0 if the file is a symlink pointing into TOOLKIT_ROOT (toolkit-owned).
# Returns 1 otherwise (user-owned or not a symlink).
is_toolkit_owned() {
    local filepath="$1"
    [[ -z "$TOOLKIT_ROOT" ]] && return 1
    [[ ! -L "$filepath" ]] && return 1
    local target
    target=$(readlink -f "$filepath" 2>/dev/null) || return 1
    local resolved_root
    resolved_root=$(readlink -f "$TOOLKIT_ROOT" 2>/dev/null) || return 1
    [[ "$target" == "$resolved_root/"* || "$target" == "$resolved_root" ]]
}

# --- Debounce ---
# Returns 0 if enough time has passed since last marker update (should proceed).
# Returns 1 if debounce period has not elapsed (should skip).
# Uses file content (epoch timestamp) to match existing git-sync.sh/personal-sync.sh behavior.
debounce_check() {
    local marker_file="$1" interval_minutes="${2:-15}"
    if [[ ! -f "$marker_file" ]]; then
        return 0
    fi
    local last_sync now diff_seconds interval_seconds
    last_sync=$(cat "$marker_file" 2>/dev/null) || return 0
    # Validate it's a number
    [[ "$last_sync" =~ ^[0-9]+$ ]] || return 0
    now=$(date +%s)
    diff_seconds=$((now - last_sync))
    interval_seconds=$((interval_minutes * 60))
    [[ $diff_seconds -ge $interval_seconds ]]
}

# Update debounce marker with current epoch timestamp.
debounce_touch() {
    local marker_file="$1"
    mkdir -p "$(dirname "$marker_file")"
    date +%s > "$marker_file"
}

# --- Path normalization ---
# Normalize a path to canonical form (resolve symlinks, handle Windows paths).
normalize_path() {
    local path="$1"
    # Convert Windows-style paths
    path="${path//\\//}"
    # Resolve to absolute
    if command -v realpath &>/dev/null; then
        realpath "$path" 2>/dev/null || echo "$path"
    elif command -v readlink &>/dev/null; then
        readlink -f "$path" 2>/dev/null || echo "$path"
    else
        echo "$path"
    fi
}

# --- Multi-backend helpers ---
# Parse comma-separated backend list from config.
get_backends() {
    local backends
    backends=$(config_get "PERSONAL_SYNC_BACKEND" "")
    if [[ -z "$backends" ]]; then
        echo ""
        return
    fi
    # Normalize: trim spaces, convert to newline-separated
    echo "$backends" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$'
}

# Get the first configured backend (preferred pull source per D6).
get_primary_backend() {
    get_backends | head -1
}
```

- [ ] **Step 2: Verify syntax**

Run: `bash -n core/hooks/lib/backup-common.sh`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add core/hooks/lib/backup-common.sh
git commit -m "feat(backup): add shared library lib/backup-common.sh

Extracts debounce, logging, config reading, symlink ownership
detection, and path normalization into a shared library sourced
by git-sync, personal-sync, and session-start hooks.

Design ref: backup-system-refactor-design D1, D2"
```

---

## Task 2: Create migration framework

**Files:**
- Create: `core/hooks/lib/migrate.sh`
- Create: `core/hooks/migrations/v1.json`

- [ ] **Step 1: Create migrations/ directory and v1.json schema**

`v1.json` defines the expected backup file layout at schema version 1:

```json
{
    "schema_version": 1,
    "description": "Initial backup schema — baseline file layout as of backup refactor v4.0",
    "expected_structure": {
        "memory": "projects/*/memory/",
        "claude_md": "CLAUDE.md",
        "config": "toolkit-state/config.json",
        "encyclopedia": "encyclopedia/",
        "custom_skills": "skills/*/",
        "meta": "backup-meta.json"
    },
    "notes": "Files are relative to ~/.claude/. Custom skills are those not symlinked into TOOLKIT_ROOT."
}
```

- [ ] **Step 2: Create lib/migrate.sh**

```bash
#!/usr/bin/env bash
# migrate.sh — Backup schema migration runner
# Design ref: backup-system-refactor-design (03-22-2026).md D7
#
# Usage: source lib/migrate.sh; run_migrations <restore_dir>
# Reads backup-meta.json from restore_dir, compares schema_version
# to current expected version, runs sequential migrations.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

# Current schema version this toolkit expects
CURRENT_SCHEMA_VERSION=1

# Read schema version from a backup-meta.json file.
# Returns 0 if no meta file exists (pre-refactor backup).
get_backup_schema_version() {
    local meta_file="$1/backup-meta.json"
    if [[ ! -f "$meta_file" ]]; then
        echo "0"
        return
    fi
    if command -v node &>/dev/null; then
        node -e "
            try {
                const m = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                process.stdout.write(String(m.schema_version || 0));
            } catch(e) { process.stdout.write('0'); }
        " "$meta_file" 2>/dev/null || echo "0"
    else
        grep -oP '"schema_version"\s*:\s*\K[0-9]+' "$meta_file" 2>/dev/null || echo "0"
    fi
}

# Write backup-meta.json with current schema and toolkit versions.
write_backup_meta() {
    local target_dir="$1"
    local toolkit_version="unknown"
    if [[ -f "$TOOLKIT_ROOT/VERSION" ]]; then
        toolkit_version=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null || echo "unknown")
    fi
    cat > "$target_dir/backup-meta.json" << METAEOF
{
    "schema_version": $CURRENT_SCHEMA_VERSION,
    "toolkit_version": "$toolkit_version",
    "last_backup": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "platform": "$(uname -s)"
}
METAEOF
}

# Run all necessary migrations from backup_version to CURRENT_SCHEMA_VERSION.
# Returns 0 on success, 1 on failure.
run_migrations() {
    local restore_dir="$1"
    local backup_version
    backup_version=$(get_backup_schema_version "$restore_dir")

    # Backup is newer than toolkit — can't forward-migrate
    if [[ "$backup_version" -gt "$CURRENT_SCHEMA_VERSION" ]]; then
        log_backup "ERROR" "Backup schema v$backup_version is newer than toolkit's v$CURRENT_SCHEMA_VERSION. Run /update first."
        return 1
    fi

    # Already at current version — no migration needed
    if [[ "$backup_version" -eq "$CURRENT_SCHEMA_VERSION" ]]; then
        log_backup "INFO" "Backup schema v$backup_version matches current — no migration needed."
        return 0
    fi

    # Run sequential migrations
    local from_version=$backup_version
    while [[ $from_version -lt $CURRENT_SCHEMA_VERSION ]]; do
        local next_version=$((from_version + 1))
        local migration_script="$MIGRATIONS_DIR/v${from_version}-to-v${next_version}.sh"
        if [[ -f "$migration_script" ]]; then
            log_backup "INFO" "Running migration v$from_version → v$next_version..."
            if ! bash "$migration_script" "$restore_dir"; then
                log_backup "ERROR" "Migration v$from_version → v$next_version FAILED. Restore aborted."
                return 1
            fi
            log_backup "INFO" "Migration v$from_version → v$next_version completed."
        else
            log_backup "INFO" "No migration script for v$from_version → v$next_version (no structural changes)."
        fi
        from_version=$next_version
    done

    log_backup "INFO" "All migrations complete. Backup is now at schema v$CURRENT_SCHEMA_VERSION."
    return 0
}
```

- [ ] **Step 3: Verify syntax for both files**

Run: `bash -n core/hooks/lib/migrate.sh`
Expected: No output (clean parse)

Run: `python3 -c "import json; json.load(open('core/hooks/migrations/v1.json'))" || node -e "JSON.parse(require('fs').readFileSync('core/hooks/migrations/v1.json','utf8'))"`
Expected: No error

- [ ] **Step 4: Commit**

```bash
git add core/hooks/lib/migrate.sh core/hooks/migrations/v1.json
git commit -m "feat(backup): add migration framework

Schema-versioned backups with sequential migration runner.
Starts at v1 (current layout). Pre-refactor backups treated as v0.
Aborts if backup is newer than toolkit (directs to /update).

Design ref: backup-system-refactor-design D7"
```

---

## Task 3: Refactor git-sync.sh

**Files:**
- Modify: `core/hooks/git-sync.sh` (245 lines)

- [ ] **Step 1: Add lib sourcing and symlink filter at top of script**

After the existing variable declarations (around line 20), add:

```bash
# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi
```

- [ ] **Step 2: Add symlink ownership check before git staging**

Find the section where git-sync stages files for commit (around line 125, before `git add`). Add a check:

```bash
# Skip toolkit-owned files (symlinks into toolkit repo) — Design ref: D2
if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$NORMALIZED_PATH"; then
    exit 0
fi
```

This ensures toolkit-owned files (skills, hooks, commands that are symlinks) are never committed to the user's config repo.

- [ ] **Step 3: Remove inline Drive archive logic**

Delete lines 213-232 (the rclone archive block that runs after successful push). This functionality moves to personal-sync.sh per Design ref D4.

The block to remove starts with a comment like `# Archive to Drive` or `# Best-effort Drive archive` and contains `rclone copy` commands targeting `gdrive:Claude/Backup/`.

Replace with a comment:

```bash
# Drive archive removed — personal-sync.sh handles all backend replication (D4)
```

- [ ] **Step 4: Replace inline debounce logic with shared function**

Find the push debounce check (around lines 166-177) that reads `$PUSH_MARKER`. Replace the inline timestamp arithmetic with a call to the shared function:

```bash
# Check push debounce (15-minute interval)
if type debounce_check &>/dev/null; then
    debounce_check "$PUSH_MARKER" 15 || exit 0
else
    # Fallback if lib not available
    if [[ -f "$PUSH_MARKER" ]]; then
        LAST_PUSH=$(stat -c %Y "$PUSH_MARKER" 2>/dev/null || stat -f %m "$PUSH_MARKER" 2>/dev/null) || LAST_PUSH=0
        NOW=$(date +%s)
        [[ $((NOW - LAST_PUSH)) -lt 900 ]] && exit 0
    fi
fi
```

- [ ] **Step 5: Verify syntax**

Run: `bash -n core/hooks/git-sync.sh`
Expected: No output (clean parse)

- [ ] **Step 6: Commit**

```bash
git add core/hooks/git-sync.sh
git commit -m "refactor(git-sync): remove Drive archive, add symlink filter

- Skip toolkit-owned files (symlinks into TOOLKIT_ROOT) before staging
- Remove inline Drive archive logic (moved to personal-sync per D4)
- Source shared lib/backup-common.sh for debounce and ownership detection

Design ref: backup-system-refactor-design D2, D4"
```

---

## Task 4: Refactor personal-sync.sh

**Files:**
- Modify: `core/hooks/personal-sync.sh` (222 lines)

This is the largest change — expanding scope, adding iCloud, implementing multi-backend loop.

- [ ] **Step 1: Add lib sourcing and update path filter**

Replace the existing path filter (lines 22-31) to expand the backed-up file scope:

```bash
# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi

# --- Path filter: only sync personal data files ---
# Design ref: backup-system-refactor-design, Backup Scope
FILE_PATH="$1"
case "$FILE_PATH" in
    */projects/*/memory/*) ;;  # User memory files
    */CLAUDE.md) ;;             # User instructions
    */toolkit-state/config.json) ;; # Toolkit configuration
    */encyclopedia/*) ;;        # Encyclopedia cache
    */skills/*)                 # Only user-created skills (not symlinks)
        if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$FILE_PATH"; then
            exit 0
        fi
        ;;
    *) exit 0 ;;  # Not personal data — skip
esac
```

- [ ] **Step 2: Add iCloud backend function**

After the existing `sync_github()` function (ends around line 203), add:

```bash
# --- iCloud backend: local folder copy ---
# Design ref: D5 — iCloud uses direct file operations, not rclone.
# macOS: ~/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude/
# Windows: ~/iCloudDrive/DestinClaude/ or ~/Apple/CloudDocs/DestinClaude/
sync_icloud() {
    local ICLOUD_PATH
    ICLOUD_PATH=$(config_get "ICLOUD_PATH" "")

    if [[ -z "$ICLOUD_PATH" ]]; then
        # Auto-detect iCloud folder
        if [[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ]]; then
            ICLOUD_PATH="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude"
        elif [[ -d "$HOME/iCloudDrive" ]]; then
            ICLOUD_PATH="$HOME/iCloudDrive/DestinClaude"
        elif [[ -d "$HOME/Apple/CloudDocs" ]]; then
            ICLOUD_PATH="$HOME/Apple/CloudDocs/DestinClaude"
        else
            log_backup "ERROR" "iCloud Drive folder not found. Install the iCloud app or configure ICLOUD_PATH."
            return 1
        fi
    fi

    if [[ ! -d "$ICLOUD_PATH" ]]; then
        mkdir -p "$ICLOUD_PATH" || {
            log_backup "ERROR" "Cannot create iCloud sync directory: $ICLOUD_PATH"
            return 1
        }
    fi

    log_backup "INFO" "Syncing personal data to iCloud: $ICLOUD_PATH"

    # Copy personal data files
    # Memory files
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            mkdir -p "$ICLOUD_PATH/memory/$PROJECT_KEY"
            # Use cp with --update to skip newer destination files
            rsync -a --update "$MEMORY_DIR/" "$ICLOUD_PATH/memory/$PROJECT_KEY/" 2>/dev/null || \
                cp -r "$MEMORY_DIR"/* "$ICLOUD_PATH/memory/$PROJECT_KEY/" 2>/dev/null || true
        done
    fi

    # CLAUDE.md
    [[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && rsync -a --update "$CLAUDE_DIR/CLAUDE.md" "$ICLOUD_PATH/" 2>/dev/null || \
        cp "$CLAUDE_DIR/CLAUDE.md" "$ICLOUD_PATH/" 2>/dev/null || true

    # Config
    [[ -f "$CONFIG_FILE" ]] && {
        mkdir -p "$ICLOUD_PATH/toolkit-state"
        rsync -a --update "$CONFIG_FILE" "$ICLOUD_PATH/toolkit-state/" 2>/dev/null || \
            cp "$CONFIG_FILE" "$ICLOUD_PATH/toolkit-state/" 2>/dev/null || true
    }

    # Encyclopedia cache
    if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
        mkdir -p "$ICLOUD_PATH/encyclopedia"
        rsync -a --update "$CLAUDE_DIR/encyclopedia/" "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || \
            cp -r "$CLAUDE_DIR/encyclopedia"/* "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || true
    fi

    # User-created skills (non-symlinks)
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                mkdir -p "$ICLOUD_PATH/skills/$skill_name"
                rsync -a --update "$skill_dir" "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || \
                    cp -r "$skill_dir"* "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi

    log_backup "INFO" "iCloud sync complete."
    return 0
}
```

- [ ] **Step 3: Replace single-backend dispatch with multi-backend loop**

Replace the existing backend selection (lines 207-214, the `case` statement) with:

```bash
# --- Multi-backend sync loop (Design ref: D6) ---
# Push to ALL configured backends. Failure in one does not block others.
_sync_errors=0
while IFS= read -r backend; do
    [[ -z "$backend" ]] && continue
    case "$backend" in
        drive)
            sync_drive || { log_backup "WARN" "Drive sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        github)
            sync_github || { log_backup "WARN" "GitHub sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        icloud)
            sync_icloud || { log_backup "WARN" "iCloud sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        *)
            log_backup "WARN" "Unknown backend: $backend — skipping" ;;
    esac
done < <(get_backends)

# Write backup-meta.json after successful sync (Design ref: D7)
if [[ $_sync_errors -eq 0 ]] && type write_backup_meta &>/dev/null; then
    write_backup_meta "$CLAUDE_DIR"
fi
```

- [ ] **Step 4: Update sync_drive() to include expanded scope**

The existing `sync_drive()` (lines 79-126) only syncs memory, CLAUDE.md, and config. Expand it to also sync encyclopedia cache and user-created skills (same files as the iCloud backend). Add after the existing CLAUDE.md sync:

```bash
    # Encyclopedia cache
    if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
        rclone sync "$CLAUDE_DIR/encyclopedia/" "$DRIVE_DEST/encyclopedia/" \
            --update --exclude '.DS_Store' 2>/dev/null || \
            log_backup "WARN" "Encyclopedia sync to Drive failed"
    fi

    # User-created skills (non-symlinks)
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                rclone sync "$skill_dir" "$DRIVE_DEST/skills/$skill_name/" \
                    --update --exclude '.DS_Store' 2>/dev/null || \
                    log_backup "WARN" "Skill $skill_name sync to Drive failed"
            fi
        done
    fi
```

- [ ] **Step 5: Update sync_github() with expanded scope similarly**

Add the same encyclopedia and user-created skills copy logic to `sync_github()`, after the existing file copy section (around line 178):

```bash
    # Encyclopedia cache
    if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
        mkdir -p "$REPO_DIR/encyclopedia"
        cp -r "$CLAUDE_DIR/encyclopedia"/* "$REPO_DIR/encyclopedia/" 2>/dev/null || true
    fi

    # User-created skills (non-symlinks)
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                mkdir -p "$REPO_DIR/skills/$skill_name"
                cp -r "$skill_dir"* "$REPO_DIR/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi
```

- [ ] **Step 6: Verify syntax**

Run: `bash -n core/hooks/personal-sync.sh`
Expected: No output (clean parse)

- [ ] **Step 7: Commit**

```bash
git add core/hooks/personal-sync.sh
git commit -m "refactor(personal-sync): multi-backend loop, iCloud support, expanded scope

- Add sync_icloud() for local folder copy to iCloud Drive
- Replace single-backend dispatch with multi-backend loop over all configured backends
- Expand backup scope: encyclopedia cache, user-created skills (non-symlinks)
- Write backup-meta.json after successful sync cycle
- Backend failure isolation: one failure does not block others

Design ref: backup-system-refactor-design D4, D5, D6"
```

---

## Task 5: Refactor session-start.sh

**Files:**
- Modify: `core/hooks/session-start.sh` (485 lines)

- [ ] **Step 1: Add lib sourcing at top of script**

After the existing variable declarations, add:

```bash
# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi
# Source migration runner
if [[ -f "$HOOK_DIR/lib/migrate.sh" ]]; then
    source "$HOOK_DIR/lib/migrate.sh"
fi
```

- [ ] **Step 2: Add toolkit integrity check (new section before symlink verification)**

Insert before line 82 (the current symlink verification block). This is the D8 integrity check.

**Note on D8:** The design says "offer to fix" interactively, but session-start.sh is a non-interactive hook — it cannot prompt the user for input. The pragmatic implementation is a passive warning directing the user to `/setup-wizard` for interactive repair. This is the best a shell hook can do and matches the design's degraded-mode intent.

```bash
# --- Toolkit integrity check (Design ref: D8) ---
# Verify toolkit repo exists and is complete. If broken, offer to fix.
if [[ -n "$TOOLKIT_ROOT" ]]; then
    _INTEGRITY_OK=true
    _INTEGRITY_MSG=""

    [[ ! -d "$TOOLKIT_ROOT" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit directory missing: $TOOLKIT_ROOT"; }
    [[ "$_INTEGRITY_OK" == true && ! -d "$TOOLKIT_ROOT/.git" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit .git directory missing"; }
    [[ "$_INTEGRITY_OK" == true && ! -f "$TOOLKIT_ROOT/VERSION" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit VERSION file missing"; }
    [[ "$_INTEGRITY_OK" == true && ! -f "$TOOLKIT_ROOT/plugin.json" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit plugin.json missing"; }

    if [[ "$_INTEGRITY_OK" == false ]]; then
        echo "{\"hookSpecificOutput\": \"Toolkit integrity check failed: $_INTEGRITY_MSG. Run /setup-wizard to repair, or run: git clone https://github.com/itsdestin/destinclaude.git \\\"$TOOLKIT_ROOT\\\" to restore the toolkit repo.\"}" >&2
    fi
fi
```

- [ ] **Step 3: Upgrade symlink verification to auto-repair (replace lines 82-100)**

Replace the existing warn-only block with auto-repair logic per D3:

```bash
# --- Auto-repair legacy copies to symlinks (Design ref: D3) ---
# Pre-v1.3.1 installs used file copies. Replace identical copies with symlinks.
# Modified copies are warned about but NOT replaced (non-destructive mandate).
if [[ -n "$TOOLKIT_ROOT" && -d "$TOOLKIT_ROOT/core/hooks" ]]; then
    [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && export MSYS=winsymlinks:nativestrict

    _REPAIRED=""
    _MODIFIED=""

    # Check all expected toolkit hook files
    for _hook in checklist-reminder.sh contribution-detector.sh done-sound.sh git-sync.sh personal-sync.sh session-start.sh title-update.sh todo-capture.sh tool-router.sh write-guard.sh; do
        _installed="$CLAUDE_DIR/hooks/$_hook"
        _source="$TOOLKIT_ROOT/core/hooks/$_hook"
        if [[ -f "$_installed" && ! -L "$_installed" && -f "$_source" ]]; then
            # Diff before replacing (Design ref: D3 safety check)
            if diff -q "$_installed" "$_source" >/dev/null 2>&1; then
                ln -sf "$_source" "$_installed" 2>/dev/null && _REPAIRED="$_REPAIRED $_hook"
            else
                _MODIFIED="$_MODIFIED $_hook"
            fi
        fi
    done

    # Check statusline
    if [[ -f "$CLAUDE_DIR/statusline.sh" && ! -L "$CLAUDE_DIR/statusline.sh" && -f "$TOOLKIT_ROOT/core/hooks/statusline.sh" ]]; then
        if diff -q "$CLAUDE_DIR/statusline.sh" "$TOOLKIT_ROOT/core/hooks/statusline.sh" >/dev/null 2>&1; then
            ln -sf "$TOOLKIT_ROOT/core/hooks/statusline.sh" "$CLAUDE_DIR/statusline.sh" 2>/dev/null && _REPAIRED="$_REPAIRED statusline.sh"
        else
            _MODIFIED="$_MODIFIED statusline.sh"
        fi
    fi

    # Check skills
    for _skill_link in "$CLAUDE_DIR/skills"/*/; do
        [[ ! -d "$_skill_link" ]] && continue
        _skill_name=$(basename "$_skill_link")
        if [[ ! -L "${_skill_link%/}" ]]; then
            # Find matching source in toolkit layers
            for _layer in core life productivity; do
                _skill_source="$TOOLKIT_ROOT/$_layer/skills/$_skill_name"
                if [[ -d "$_skill_source" ]]; then
                    if diff -rq "${_skill_link%/}" "$_skill_source" >/dev/null 2>&1; then
                        rm -rf "${_skill_link%/}"
                        ln -sf "$_skill_source" "${_skill_link%/}" 2>/dev/null && _REPAIRED="$_REPAIRED skill:$_skill_name"
                    else
                        _MODIFIED="$_MODIFIED skill:$_skill_name"
                    fi
                    break
                fi
            done
        fi
    done

    [[ -n "$_REPAIRED" ]] && echo "{\"hookSpecificOutput\": \"Auto-repaired copy-based files to symlinks:$_REPAIRED\"}" >&2
    [[ -n "$_MODIFIED" ]] && echo "{\"hookSpecificOutput\": \"Found modified copies (not auto-repaired, run /health to review):$_MODIFIED\"}" >&2
fi
```

- [ ] **Step 4: Verify git pull is already conditional (no changes needed)**

The existing code at lines 73-80 already checks `git remote get-url origin` before pulling, which matches D9's intent. No modification needed — just verify the code is:

```bash
cd "$CLAUDE_DIR"
if git remote get-url origin &>/dev/null; then
    if ! git pull --rebase origin main 2>/dev/null; then
        git rebase --abort 2>/dev/null || true
        echo '{"hookSpecificOutput": "Warning: Git pull failed on session start. Working with local state."}' >&2
    fi
fi
```

This is already conditional — users without a git remote configured at `~/.claude/` skip it entirely.

- [ ] **Step 5: Update personal data pull to use multi-backend**

Replace the existing personal data pull section (lines 137-191) with backend-aware logic:

```bash
# --- Personal data pull from configured backend (Design ref: D6) ---
# Pull from the first (preferred) configured backend only.
_PULL_BACKEND=""
if type get_primary_backend &>/dev/null; then
    _PULL_BACKEND=$(get_primary_backend)
fi

if [[ -n "$_PULL_BACKEND" ]]; then
    case "$_PULL_BACKEND" in
        drive)
            DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")
            DRIVE_SOURCE="gdrive:$DRIVE_ROOT/Backup/personal"
            if command -v rclone &>/dev/null; then
                # Memory files
                rclone sync "$DRIVE_SOURCE/memory/" "$CLAUDE_DIR/projects/" \
                    --update --exclude '.DS_Store' 2>/dev/null || \
                    log_backup "WARN" "Drive pull (memory) failed"
                # CLAUDE.md
                rclone copy "$DRIVE_SOURCE/CLAUDE.md" "$CLAUDE_DIR/" \
                    --update 2>/dev/null || true
                # Config
                rclone copy "$DRIVE_SOURCE/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" \
                    --update 2>/dev/null || true
                # Encyclopedia
                rclone sync "$DRIVE_SOURCE/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" \
                    --update --exclude '.DS_Store' 2>/dev/null || true
            fi
            ;;
        github)
            SYNC_REPO=$(config_get "PERSONAL_SYNC_REPO" "")
            REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
            if [[ -n "$SYNC_REPO" && -d "$REPO_DIR/.git" ]]; then
                cd "$REPO_DIR"
                git pull personal-sync main 2>/dev/null || true
                # Copy restored files to live locations
                [[ -d "$REPO_DIR/memory" ]] && rsync -a --update "$REPO_DIR/memory/" "$CLAUDE_DIR/projects/" 2>/dev/null || true
                [[ -f "$REPO_DIR/CLAUDE.md" ]] && rsync -a --update "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/" 2>/dev/null || true
                [[ -f "$REPO_DIR/toolkit-state/config.json" ]] && rsync -a --update "$REPO_DIR/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" 2>/dev/null || true
                [[ -d "$REPO_DIR/encyclopedia" ]] && rsync -a --update "$REPO_DIR/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" 2>/dev/null || true
                cd "$CLAUDE_DIR"
            fi
            ;;
        icloud)
            ICLOUD_PATH=$(config_get "ICLOUD_PATH" "")
            # Auto-detect if not configured
            if [[ -z "$ICLOUD_PATH" ]]; then
                for _try in "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude" \
                            "$HOME/iCloudDrive/DestinClaude" \
                            "$HOME/Apple/CloudDocs/DestinClaude"; do
                    [[ -d "$_try" ]] && { ICLOUD_PATH="$_try"; break; }
                done
            fi
            if [[ -n "$ICLOUD_PATH" && -d "$ICLOUD_PATH" ]]; then
                [[ -d "$ICLOUD_PATH/memory" ]] && rsync -a --update "$ICLOUD_PATH/memory/" "$CLAUDE_DIR/projects/" 2>/dev/null || true
                [[ -f "$ICLOUD_PATH/CLAUDE.md" ]] && rsync -a --update "$ICLOUD_PATH/CLAUDE.md" "$CLAUDE_DIR/" 2>/dev/null || true
                [[ -f "$ICLOUD_PATH/toolkit-state/config.json" ]] && rsync -a --update "$ICLOUD_PATH/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" 2>/dev/null || true
                [[ -d "$ICLOUD_PATH/encyclopedia" ]] && rsync -a --update "$ICLOUD_PATH/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" 2>/dev/null || true
            fi
            ;;
    esac
fi
```

- [ ] **Step 6: Add migration check after personal data pull**

Insert after the personal data pull section:

```bash
# --- Migration check (Design ref: D7) ---
# Compare backup schema version against current. Run migrations if needed.
if type run_migrations &>/dev/null && [[ -f "$CLAUDE_DIR/backup-meta.json" ]]; then
    run_migrations "$CLAUDE_DIR" || {
        echo '{"hookSpecificOutput": "Warning: Backup migration failed. Some restored data may be in an old format. Run /restore to retry."}' >&2
    }
fi
```

- [ ] **Step 7: Verify syntax**

Run: `bash -n core/hooks/session-start.sh`
Expected: No output (clean parse)

- [ ] **Step 8: Commit**

```bash
git add core/hooks/session-start.sh
git commit -m "refactor(session-start): integrity check, auto-repair, multi-backend pull

- Add toolkit integrity check (D8): verify repo completeness, offer recovery
- Upgrade symlink verification to auto-repair identical copies (D3)
- Make ~/.claude git pull conditional on remote existing (D9)
- Replace single-backend personal data pull with multi-backend support (D6)
- Add migration check after pull (D7)

Design ref: backup-system-refactor-design D3, D6, D7, D8, D9"
```

---

## Task 6: Create `/restore` command

**Files:**
- Create: `core/commands/restore.md`

- [ ] **Step 1: Write the restore command**

```markdown
---
description: Restore personal data from a backup (Google Drive, GitHub, or iCloud)
---

# /restore — Ad-Hoc Personal Data Restore

Restore personal data from a backup outside of the setup wizard. Use this when you want to pull data from a backup on a machine that already has DestinClaude installed.

## Step 1: Check current state

Before restoring, warn the user if they have existing personal data that would be overwritten:

```bash
CLAUDE_DIR="$HOME/.claude"
HAS_MEMORY=$(find "$CLAUDE_DIR/projects" -name "*.md" -path "*/memory/*" 2>/dev/null | head -1)
HAS_CLAUDE_MD=""
[[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && HAS_CLAUDE_MD="yes"
```

If either `HAS_MEMORY` or `HAS_CLAUDE_MD` is non-empty, tell the user:

> "You have existing personal data (memory files and/or CLAUDE.md). Restoring will merge with or overwrite this data. Continue?"

Wait for confirmation before proceeding.

## Step 2: Choose backend

Ask:

> "Where is your backup stored?"
>
> 1. Google Drive
> 2. GitHub (private repo)
> 3. iCloud

## Step 3: Backend-specific restore

### Option 1: Google Drive

1. Verify rclone is installed and `gdrive:` remote is configured: `rclone lsd gdrive: 2>/dev/null`
2. If not configured, walk through rclone setup (same as setup wizard Phase 4 Life Dependencies)
3. Ask for Drive root folder name (default: "Claude")
4. Pull: `rclone sync "gdrive:$DRIVE_ROOT/Backup/personal/" "$CLAUDE_DIR/.restore-staging/" --progress`

### Option 2: GitHub

1. Ask for the private repo URL
2. Clone to staging: `git clone "$REPO_URL" "$CLAUDE_DIR/.restore-staging/" 2>/dev/null`
3. If clone fails, check if repo exists and user has access

### Option 3: iCloud

1. Detect iCloud folder:
   - macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude/`
   - Windows: `~/iCloudDrive/DestinClaude/` or `~/Apple/CloudDocs/DestinClaude/`
2. If not found, ask the user to point to their iCloud Drive folder
3. Copy to staging: `cp -r "$ICLOUD_PATH/" "$CLAUDE_DIR/.restore-staging/"`

## Step 4: Run migrations

Source `lib/migrate.sh` and run:

```bash
HOOK_DIR="$(cd "$(dirname "$(readlink -f "$HOME/.claude/hooks/session-start.sh")")" && pwd)"
source "$HOOK_DIR/lib/migrate.sh"
run_migrations "$CLAUDE_DIR/.restore-staging/"
```

If migration fails (backup newer than toolkit), tell the user to run `/update` first.

## Step 5: CLAUDE.md merge

If both the backup and the current install have CLAUDE.md, present three options:

> "Your backup contains a CLAUDE.md. How would you like to handle it?"
>
> 1. **Merge** (recommended) — Keep your personal notes and preferences, update toolkit sections to match current install
> 2. **Use backup** — Replace current CLAUDE.md with the backup version exactly
> 3. **Keep current** — Ignore the backup's CLAUDE.md entirely

For option 1 (merge): toolkit sections are wrapped in `<!-- BEGIN:section-name -->` / `<!-- END:section-name -->` markers. Replace content between markers with the current install's version. Preserve everything outside markers as user content.

## Step 6: Apply restore

Copy files from staging to live locations:

```bash
# Memory
[[ -d "$CLAUDE_DIR/.restore-staging/memory" ]] && cp -r "$CLAUDE_DIR/.restore-staging/memory"/* "$CLAUDE_DIR/projects/" 2>/dev/null

# Config (merge, don't overwrite — current install may have newer keys)
# Use node to merge JSON if available
# Config: merge backup keys into current config (don't overwrite — current install may have newer keys)
if [[ -f "$CLAUDE_DIR/.restore-staging/toolkit-state/config.json" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const current = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
        // Backup fills in missing keys only — current values take precedence
        const merged = { ...backup, ...current };
        fs.writeFileSync(process.argv[1], JSON.stringify(merged, null, 2));
    " "$CLAUDE_DIR/toolkit-state/config.json" "$CLAUDE_DIR/.restore-staging/toolkit-state/config.json" 2>/dev/null
fi

# Encyclopedia
[[ -d "$CLAUDE_DIR/.restore-staging/encyclopedia" ]] && cp -r "$CLAUDE_DIR/.restore-staging/encyclopedia"/* "$CLAUDE_DIR/encyclopedia/" 2>/dev/null

# User-created skills
[[ -d "$CLAUDE_DIR/.restore-staging/skills" ]] && cp -r "$CLAUDE_DIR/.restore-staging/skills"/* "$CLAUDE_DIR/skills/" 2>/dev/null
```

## Step 7: Clean up and confirm

```bash
rm -rf "$CLAUDE_DIR/.restore-staging"
```

Tell the user: "Restore complete. Your personal data has been recovered from [backend name]."
```

- [ ] **Step 2: Verify the file exists and has valid frontmatter**

Run: `head -3 core/commands/restore.md`
Expected: Shows YAML frontmatter with description field

- [ ] **Step 3: Commit**

```bash
git add core/commands/restore.md
git commit -m "feat: add /restore command for ad-hoc personal data restore

Supports all three backends (Drive, GitHub, iCloud). Includes
migration check, CLAUDE.md merge prompt, and staging directory
for safe restore-then-apply workflow.

Design ref: backup-system-refactor-design D10"
```

---

## Task 7: Update setup wizard

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (1432 lines)

- [ ] **Step 1: Add Phase 0C (iCloud Restore) after Phase 0B (Drive Restore)**

Insert after Phase 0B (around line 224). Follow the same structure as Phase 0A and 0B:

```markdown
## Phase 0C: iCloud Restore

### Step 1: Detect iCloud Drive folder

Check for iCloud Drive in standard locations:

```bash
ICLOUD_PATH=""
# macOS
[[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude" ]] && \
    ICLOUD_PATH="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude"
# Windows (iCloud for Windows)
[[ -z "$ICLOUD_PATH" && -d "$HOME/iCloudDrive/DestinClaude" ]] && \
    ICLOUD_PATH="$HOME/iCloudDrive/DestinClaude"
# Windows (Microsoft Store version)
[[ -z "$ICLOUD_PATH" && -d "$HOME/Apple/CloudDocs/DestinClaude" ]] && \
    ICLOUD_PATH="$HOME/Apple/CloudDocs/DestinClaude"
```

If not found, ask: "I couldn't find your iCloud Drive folder automatically. Where is it? (Full path to your iCloud Drive DestinClaude folder)"

### Step 2: Verify backup exists

Check if the iCloud backup has data:

```bash
ls "$ICLOUD_PATH/CLAUDE.md" "$ICLOUD_PATH/memory" "$ICLOUD_PATH/toolkit-state/config.json" 2>/dev/null
```

If none exist, tell the user: "No DestinClaude backup found in your iCloud Drive. Let's do a fresh install instead." Proceed to Phase 0.5.

### Step 3: Pull data from iCloud

```bash
mkdir -p ~/.claude/.restore-staging
cp -r "$ICLOUD_PATH"/* ~/.claude/.restore-staging/ 2>/dev/null
```

### Step 4: Run migrations

Source `lib/migrate.sh` and run migrations on the staging directory (same as Phase 0A Step 5).

### Step 5: Apply restored data

Apply the staged data to live locations (same process as Phase 0A Step 5 / Phase 0B Step 4).

### Step 6: CLAUDE.md merge

Present the three merge options (merge / use backup / start fresh) — same as Phase 0A.

### Step 7: Confirm and continue

Tell the user: "Your config is restored from iCloud. Now let me confirm all the tools it needs are installed on this machine."

Proceed to **Phase 0D: Abbreviated Dependency Check** (rename from current Phase 0C).
```

- [ ] **Step 2: Update Phase 0 to include iCloud option**

In Phase 0 (around line 30), update the backend choice prompt to include iCloud as a real option (not "coming soon"):

Replace the existing option 3 text with:
```
  3. iCloud
```

And update the routing:
```
- **3 (iCloud):** Proceed to **Phase 0C: iCloud Restore**.
```

- [ ] **Step 3: Rename current Phase 0C to Phase 0D**

The current "Phase 0C: Abbreviated Dependency Check" becomes "Phase 0D" since Phase 0C is now iCloud Restore. Update all internal references.

- [ ] **Step 4: Add backend multi-select to Phase 5 (Personalization)**

Insert a new section in Phase 5 (around line 886), after template variables are collected but before layer installation. Add as Phase 5.0 (before 5.1):

```markdown
### Phase 5.0: Personal Data Backup Setup

Ask the user:

> "Where would you like to back up your personal data? This keeps your memory, preferences, and encyclopedia safe across devices. You can choose more than one."
>
> - [ ] Google Drive (requires rclone — we set this up in Phase 4 if you chose the Life layer)
> - [ ] GitHub private repo (free, requires a GitHub account)
> - [ ] iCloud (requires iCloud app on Windows, built-in on macOS)
>
> (You can also skip this for now and set it up later with `/restore`)

For each selected backend:

**Google Drive:**
- Verify rclone and gdrive: remote are configured (should be done in Phase 4 if Life layer selected)
- If not configured, walk through rclone setup now
- Store `DRIVE_ROOT` in config.json (from Phase 5.1 template variables, or ask now)

**GitHub:**
- Ask: "Do you have a private GitHub repo for your config backup? If not, I can help you create one."
- If creating: `gh repo create <username>/claude-config --private --clone`
- Store `PERSONAL_SYNC_REPO` in config.json

**iCloud:**
- Detect iCloud folder (same detection logic as Phase 0C Step 1)
- If not found on macOS, warn that iCloud Drive may not be enabled
- If not found on Windows, instruct to install iCloud for Windows app
- Store `ICLOUD_PATH` in config.json

Store the selected backends as comma-separated `PERSONAL_SYNC_BACKEND` in config.json. Example: `"drive,github"`.

**Run initial sync** to confirm the backend works:

```bash
# Trigger personal-sync manually to test
source ~/.claude/hooks/lib/backup-common.sh
# Touch the debounce marker in the past to force sync
touch -t 202001010000 ~/.claude/toolkit-state/.personal-sync-marker 2>/dev/null
```

Tell the user the result: "Backup configured! Your personal data will sync to [backends] automatically."
```

- [ ] **Step 5: Verify SKILL.md is valid markdown**

Run: `wc -l core/skills/setup-wizard/SKILL.md`
Expected: Line count (should be larger than 1432 due to additions)

- [ ] **Step 6: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): iCloud restore, backend multi-select

- Add Phase 0C: iCloud Restore (parallel to 0A GitHub, 0B Drive)
- Rename old Phase 0C to Phase 0D (Abbreviated Dependency Check)
- Add Phase 5.0: Personal Data Backup Setup with multi-backend selection
- Remove 'iCloud coming soon' placeholder — all three backends now supported

Design ref: backup-system-refactor-design D5, D10"
```

---

## Task 8: Update specs

**Files:**
- Modify: `core/specs/backup-system-spec.md` (v3.3 → v4.0)
- Modify: `core/specs/personal-sync-spec.md` (v1.1 → v2.0)
- Modify: `core/specs/destinclaude-spec.md` (v2.5 → v2.6)
- Modify: `core/specs/INDEX.md`

- [ ] **Step 1: Update backup-system-spec.md to v4.0**

Key changes:
- Update version to 4.0, last updated date
- Remove `drive-archive.sh` references (absorbed into personal-sync)
- Add symlink detection as ownership mechanism (D2)
- Document migration framework (D7)
- Document integrity check (D8)
- Update data flow diagrams
- Remove references to copy-based installs
- Add `lib/backup-common.sh` to component list
- Update Change Log with v4.0 entry: "Refactored: symlink-based ownership detection, migration framework, integrity check, Drive archive absorbed into personal-sync. See backup-system-refactor-design (03-22-2026)."

- [ ] **Step 2: Update personal-sync-spec.md to v2.0**

Key changes:
- Update version to 2.0, last updated date
- Add iCloud backend documentation (D5)
- Document multi-backend loop (D6)
- Expand backup scope (encyclopedia, user-created skills)
- Document backup-meta.json writing (D7)
- Add backend failure isolation behavior
- Update Change Log with v2.0 entry

- [ ] **Step 3: Update destinclaude-spec.md to v2.6**

Key changes:
- Update version to 2.6, last updated date
- Update Layers and Components table: Core hooks now list `lib/backup-common.sh`, `lib/migrate.sh`, `migrations/`
- Add `restore` to Core commands
- Update backup-related Known Issues / Roadmap entries
- Mark iCloud support as resolved
- Update Change Log with v2.6 entry

- [ ] **Step 4: Update INDEX.md with version bumps**

Update the version numbers in INDEX.md:
- `backup-system-spec.md`: 3.3 → 4.0
- `personal-sync-spec.md`: 1.0 → 2.0 (note: INDEX.md currently shows 1.0; the spec file itself says 1.1 — use 2.0 as the new version regardless)
- `destinclaude-spec.md`: 2.5 → 2.6

- [ ] **Step 5: Commit**

```bash
git add core/specs/backup-system-spec.md core/specs/personal-sync-spec.md core/specs/destinclaude-spec.md core/specs/INDEX.md
git commit -m "docs: update specs for backup system refactor

- backup-system-spec v3.3 → v4.0 (symlink detection, migration framework, integrity check)
- personal-sync-spec v1.1 → v2.0 (iCloud backend, multi-backend, expanded scope)
- destinclaude-spec v2.5 → v2.6 (new lib/ directory, /restore command, iCloud support)
- INDEX.md version bumps"
```

---

## Task 9: Update docs and commands

**Files:**
- Modify: `docs/system-architecture.md`
- Modify: `core/commands/update.md`
- Modify: `core/commands/health.md`

- [ ] **Step 1: Update system-architecture.md**

- Add `lib/` directory to the Hooks section description
- Add `backup-common.sh` and `migrate.sh` to the hook table
- Update `git-sync.sh` description (remove Drive archive mention)
- Update `personal-sync.sh` description (multi-backend, iCloud, expanded scope)
- Add `migrations/` to the architecture overview
- Add `/restore` to the Commands section

- [ ] **Step 2: Update update.md**

- Add `lib/backup-common.sh` and `lib/migrate.sh` to the symlink refresh scope (step 3 hook refresh)
- Add `migrations/` directory to the refresh scope
- Update the canonical hook list to reflect any naming changes
- Add `restore.md` to the commands refresh list

- [ ] **Step 3: Update health.md**

- Add backend health verification: check that configured backends are reachable (rclone lsd for Drive, git ls-remote for GitHub, folder exists for iCloud)
- Add migration status check: verify backup-meta.json exists and schema version matches
- Add `lib/` and `migrations/` directory existence checks
- Verify that bootstrap/install scripts (install.sh, install.ps1) and setup wizard Phase 5 symlink creation handle subdirectories inside `core/hooks/` (specifically `lib/` and `migrations/`). If they only symlink top-level files, add logic to also symlink or copy these subdirectories.

- [ ] **Step 4: Commit**

```bash
git add docs/system-architecture.md core/commands/update.md core/commands/health.md
git commit -m "docs: update architecture, /update, and /health for backup refactor

- Add lib/ directory and migration framework to architecture docs
- Add lib/, migrations/, and /restore to /update refresh scope
- Add backend health and migration status checks to /health"
```

---

## Task 10: Clean up old design artifacts

**Files:**
- Modify: `core/plans/icloud-backup-design (03-18-2026).md`
- Modify: `core/plans/icloud-backup-plan (03-18-2026).md`

- [ ] **Step 1: Mark old iCloud plans as superseded**

Update the Status field in both files:

```
**Status:** Superseded by backup-system-refactor-design (03-22-2026).md
```

The iCloud backend is now part of the broader backup refactor, not a standalone feature.

- [ ] **Step 2: Delete stale branches**

**Note:** Verify no open PRs exist against these branches before deleting remotes (`gh pr list --head <branch>`).

```bash
git branch -d backup-system-refactor 2>/dev/null || true
git branch -d docs/documentation-drift-review 2>/dev/null || true
git push origin --delete backup-system-refactor 2>/dev/null || true
git push origin --delete docs/documentation-drift-review 2>/dev/null || true
git push origin --delete docs/fix-documentation-drift 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add "core/plans/icloud-backup-design (03-18-2026).md" "core/plans/icloud-backup-plan (03-18-2026).md"
git commit -m "chore: mark old iCloud plans as superseded, clean up branches"
```

---

## Execution Order & Dependencies

```
Task 1 (lib/backup-common.sh)
  ↓
Task 2 (migration framework)
  ↓
Task 3 (git-sync refactor)     ← depends on Task 1
Task 4 (personal-sync refactor) ← depends on Task 1, Task 2
Task 5 (session-start refactor) ← depends on Task 1, Task 2
  ↓
Task 6 (/restore command)       ← depends on Task 2
Task 7 (setup wizard)           ← depends on Tasks 3-5
  ↓
Task 8 (specs)                  ← depends on Tasks 3-7
Task 9 (docs)                   ← depends on Tasks 3-7
Task 10 (cleanup)               ← independent, can run anytime
```

Tasks 3, 4, 5 can be parallelized (they modify different files). Tasks 6 and 7 can be parallelized. Tasks 8 and 9 can be parallelized.
