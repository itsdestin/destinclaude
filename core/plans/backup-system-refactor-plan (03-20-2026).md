# Backup System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three overlapping backup scripts with a single backup engine with pluggable backend drivers, plugin manifest for ownership classification, toolkit integrity auto-recovery, and canonical backup schema with versioned migrations.

**Architecture:** A single `backup-engine.sh` replaces `git-sync.sh`, `personal-sync.sh`, and `drive-archive.sh`. Backend drivers (`backend-drive.sh`, `backend-github.sh`, `backend-icloud.sh`) implement a `push/pull/check` interface. A `plugin-manifest.json` classifies toolkit-owned vs personal files. `session-start.sh` gains toolkit integrity verification with auto-clone recovery. The setup wizard gets a new Phase 5R for post-install personal data restoration.

**Tech Stack:** Bash (POSIX-compatible for Git Bash/macOS/Linux), Node.js for JSON parsing (consistent with existing hooks), rclone for Drive, git/gh for GitHub, cp for iCloud.

**Design doc:** `core/plans/backup-system-refactor-design (03-20-2026).md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `plugin-manifest.json` | Declares all toolkit-owned files (auto-generated) |
| `backup-schema.json` | Defines current expected backup schema version + category-to-path mappings |
| `core/hooks/backup-engine.sh` | Single backup engine — file classification, debounce, push/pull orchestration |
| `core/hooks/backends/backend-drive.sh` | Google Drive driver: push/pull/check via rclone |
| `core/hooks/backends/backend-github.sh` | Private GitHub repo driver: push/pull/check via git |
| `core/hooks/backends/backend-icloud.sh` | iCloud Drive driver: push/pull/check via cp |
| `core/migrations/v1-to-v2.sh` | Placeholder migration script (schema v1 → v2) |
| `core/commands/restore.md` | `/restore` command for ad-hoc personal data restoration |
| `scripts/generate-manifest.sh` | Scans toolkit directories, generates `plugin-manifest.json` |

### Modified files
| File | What changes |
|------|-------------|
| `core/hooks/session-start.sh` | Add toolkit integrity check (lines ~11-33), replace personal data pull (lines ~146-200) with engine call, update sync health check |
| `core/hooks/write-guard.sh` | Update registry reference (backup-engine writes registry instead of git-sync) |
| `core/skills/setup-wizard/SKILL.md` | Replace Phase 0A/0B/0C (lines ~61-251) with new Phase 5R restore flow |
| `scripts/release.sh` | Add `generate-manifest.sh` call before git operations (after line ~55) |
| `core/specs/backup-system-spec.md` | Major version bump, rewrite to reflect new architecture |
| `core/specs/personal-sync-spec.md` | Deprecate or merge into backup-system-spec |

### Deleted files
| File | Reason |
|------|--------|
| `core/hooks/git-sync.sh` | Replaced by `backup-engine.sh` |
| `core/hooks/personal-sync.sh` | Replaced by `backup-engine.sh` |

---

## Task 1: Plugin Manifest Generator

**Files:**
- Create: `scripts/generate-manifest.sh`
- Create: `plugin-manifest.json`

This is the foundation — everything else depends on knowing which files are toolkit-owned.

- [ ] **Step 1: Write `generate-manifest.sh`**

```bash
#!/usr/bin/env bash
# generate-manifest.sh — Scans toolkit directories and generates plugin-manifest.json
# Called by release.sh during the release process.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Collect skills (directory names under each layer's skills/)
SKILLS='[]'
for LAYER_DIR in "$TOOLKIT_ROOT"/core/skills "$TOOLKIT_ROOT"/life/skills "$TOOLKIT_ROOT"/productivity/skills; do
    [[ ! -d "$LAYER_DIR" ]] && continue
    for SKILL_DIR in "$LAYER_DIR"/*/; do
        [[ ! -d "$SKILL_DIR" ]] && continue
        SKILL_NAME=$(basename "$SKILL_DIR")
        SKILLS=$(node -e "const s=$SKILLS; s.push('$SKILL_NAME'); console.log(JSON.stringify(s))")
    done
done

# Collect hooks (*.sh files under each layer's hooks/, excluding backends/)
HOOKS='[]'
for LAYER_DIR in "$TOOLKIT_ROOT"/core/hooks "$TOOLKIT_ROOT"/life/hooks "$TOOLKIT_ROOT"/productivity/hooks; do
    [[ ! -d "$LAYER_DIR" ]] && continue
    for HOOK_FILE in "$LAYER_DIR"/*.sh; do
        [[ ! -f "$HOOK_FILE" ]] && continue
        HOOK_NAME=$(basename "$HOOK_FILE")
        HOOKS=$(node -e "const h=$HOOKS; h.push('$HOOK_NAME'); console.log(JSON.stringify(h))")
    done
done

# Collect commands (*.md files under core/commands/)
COMMANDS='[]'
for CMD_FILE in "$TOOLKIT_ROOT"/core/commands/*.md; do
    [[ ! -f "$CMD_FILE" ]] && continue
    CMD_NAME=$(basename "$CMD_FILE")
    COMMANDS=$(node -e "const c=$COMMANDS; c.push('$CMD_NAME'); console.log(JSON.stringify(c))")
done

# Collect utility scripts (*.js files under core/hooks/)
UTILITY_SCRIPTS='[]'
for UTIL_FILE in "$TOOLKIT_ROOT"/core/hooks/*.js; do
    [[ ! -f "$UTIL_FILE" ]] && continue
    UTIL_NAME=$(basename "$UTIL_FILE")
    UTILITY_SCRIPTS=$(node -e "const u=$UTILITY_SCRIPTS; u.push('$UTIL_NAME'); console.log(JSON.stringify(u))")
done

# Collect specs (*.md files under core/specs/)
SPECS='[]'
for SPEC_FILE in "$TOOLKIT_ROOT"/core/specs/*.md; do
    [[ ! -f "$SPEC_FILE" ]] && continue
    SPEC_NAME=$(basename "$SPEC_FILE")
    SPECS=$(node -e "const s=$SPECS; s.push('$SPEC_NAME'); console.log(JSON.stringify(s))")
done

# Read current version
VERSION="unknown"
[[ -f "$TOOLKIT_ROOT/VERSION" ]] && VERSION=$(cat "$TOOLKIT_ROOT/VERSION" | tr -d '[:space:]')

# Write manifest
node -e "
const manifest = {
  version: '$VERSION',
  generated_at: new Date().toISOString(),
  owned_files: {
    skills: $SKILLS,
    hooks: $HOOKS,
    commands: $COMMANDS,
    utility_scripts: $UTILITY_SCRIPTS,
    specs: $SPECS,
    templates: ['claude-md-fragments/*']
  }
};
console.log(JSON.stringify(manifest, null, 2));
" > "$TOOLKIT_ROOT/plugin-manifest.json"

echo "Generated plugin-manifest.json (version $VERSION)"
```

- [ ] **Step 2: Run the generator and verify output**

Run: `bash scripts/generate-manifest.sh`
Expected: `plugin-manifest.json` created at repo root with skills, hooks, commands, utility_scripts, specs arrays populated.

Verify: `cat plugin-manifest.json | node -e "const m=require('/dev/stdin'); console.log('Skills:', m.owned_files.skills.length, 'Hooks:', m.owned_files.hooks.length)"`

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-manifest.sh plugin-manifest.json
git commit -m "feat: add plugin manifest generator and initial manifest

Scans toolkit layer directories to enumerate all owned skills, hooks,
commands, utility scripts, and specs. Foundation for backup engine's
file classification system (D2 in design doc)."
```

---

## Task 2: Backup Schema Definition

**Files:**
- Create: `backup-schema.json`
- Create: `core/migrations/` directory

- [ ] **Step 1: Write `backup-schema.json`**

This defines the current expected schema. The engine writes a copy of this into each backup.

```json
{
  "schema_version": 1,
  "categories": {
    "memory": {
      "description": "User memory files per project",
      "canonical_path": "memory/{project-key}/",
      "local_path": "~/.claude/projects/{project-key}/memory/"
    },
    "claude_md": {
      "description": "User's customized system instructions",
      "canonical_path": "claude-md/CLAUDE.md",
      "local_path": "~/.claude/CLAUDE.md"
    },
    "keybindings": {
      "description": "Keyboard shortcut customizations",
      "canonical_path": "config/keybindings.json",
      "local_path": "~/.claude/keybindings.json"
    },
    "user_choices": {
      "description": "User-choice subset of toolkit config",
      "canonical_path": "config/user-choices.json",
      "local_path": "~/.claude/toolkit-state/config.json",
      "merge_strategy": "user_choice_keys_only"
    },
    "conversations": {
      "description": "Conversation history transcripts",
      "canonical_path": "conversations/{project-key}/",
      "local_path": "~/.claude/projects/{project-key}/"
    },
    "encyclopedia": {
      "description": "Encyclopedia system files",
      "canonical_path": "encyclopedia/",
      "local_path": "~/.claude/encyclopedia/"
    },
    "journal": {
      "description": "Journal entries",
      "canonical_path": "journal/entries/",
      "local_path": "gdrive:{DRIVE_ROOT}/The Journal/"
    },
    "extensions_skills": {
      "description": "User-created skills not in plugin manifest",
      "canonical_path": "extensions/skills/{name}/",
      "local_path": "~/.claude/skills/{name}/"
    },
    "extensions_hooks": {
      "description": "User-created hooks not in plugin manifest",
      "canonical_path": "extensions/hooks/",
      "local_path": "~/.claude/hooks/"
    }
  },
  "user_choice_keys": [
    "comfort_level",
    "installed_layers",
    "DRIVE_ROOT",
    "primary_backend",
    "primary_backend_repo",
    "secondary_backend",
    "secondary_backend_repo",
    "backup_registry",
    "user_extensions"
  ],
  "structural_keys": [
    "toolkit_root",
    "platform",
    "setup_completed"
  ],
  "high_value_categories": [
    "memory",
    "claude_md",
    "extensions_skills"
  ],
  "exclusions": {
    "secrets": ["*.env", "*token*", "*secret*", "*credential*"],
    "ephemeral": ["sessions/", "tasks/", "shell-snapshots/", "*.lock"],
    "generated": ["settings.json", "settings.local.json", ".claude.json"],
    "build_artifacts": ["node_modules/", "__pycache__/", ".venv/"]
  }
}
```

- [ ] **Step 2: Create migrations directory with placeholder**

```bash
mkdir -p core/migrations
```

Create `core/migrations/README.md`:
```markdown
# Schema Migrations

Migration scripts transform backup data from an older schema version to a newer one.
Each script takes one argument: the path to the temp directory containing the backup data.

Naming: `v{old}-to-v{new}.sh`
Example: `v1-to-v2.sh` migrates schema version 1 to version 2.

Migrations are chained: a v1 backup restoring onto a v3 toolkit runs v1→v2, then v2→v3.
Migrations operate on a temp copy — the remote backup is never modified.
```

- [ ] **Step 3: Commit**

```bash
git add backup-schema.json core/migrations/README.md
git commit -m "feat: add backup schema definition and migrations directory

Defines canonical backup structure (schema v1) with category-to-path
mappings, user-choice vs structural config keys, high-value categories
for secondary mirror, and exclusion patterns. Migrations directory
scaffolded for future schema evolution (D8 in design doc)."
```

---

## Task 3: Backend Drivers

**Files:**
- Create: `core/hooks/backends/backend-drive.sh`
- Create: `core/hooks/backends/backend-github.sh`
- Create: `core/hooks/backends/backend-icloud.sh`

These are independent of each other and can be implemented in parallel.

### Task 3a: Drive Backend Driver

- [ ] **Step 1: Write `backend-drive.sh`**

```bash
#!/usr/bin/env bash
# backend-drive.sh — Google Drive backend driver for backup engine
# Implements: backup_push, backup_pull, backup_check
# Requires: rclone configured with gdrive: remote

# Read DRIVE_ROOT from config (passed as env var by engine)
# DRIVE_ROOT is set by the calling engine before sourcing this driver

BACKUP_REMOTE="gdrive:${DRIVE_ROOT:-Claude}/Backup"

backup_check() {
    # Return 0 if Drive backend is reachable and configured
    if ! command -v rclone &>/dev/null; then
        echo "rclone not installed" >&2
        return 1
    fi
    if ! rclone lsd "gdrive:" &>/dev/null 2>&1; then
        echo "rclone gdrive: remote not configured or unreachable" >&2
        return 1
    fi
    return 0
}

backup_push() {
    local LOCAL_PATH="$1"
    local REMOTE_PATH="$2"
    local FULL_REMOTE="$BACKUP_REMOTE/$REMOTE_PATH"

    if [[ -d "$LOCAL_PATH" ]]; then
        rclone sync "$LOCAL_PATH" "$FULL_REMOTE" --checksum 2>&1
    elif [[ -f "$LOCAL_PATH" ]]; then
        # Ensure remote directory exists
        local REMOTE_DIR
        REMOTE_DIR=$(dirname "$FULL_REMOTE")
        rclone copyto "$LOCAL_PATH" "$FULL_REMOTE" --checksum 2>&1
    else
        echo "Local path does not exist: $LOCAL_PATH" >&2
        return 1
    fi
}

backup_pull() {
    local REMOTE_PATH="$1"
    local LOCAL_PATH="$2"
    local FULL_REMOTE="$BACKUP_REMOTE/$REMOTE_PATH"

    # Create local directory if needed
    local LOCAL_DIR
    if [[ "$REMOTE_PATH" == */ ]]; then
        LOCAL_DIR="$LOCAL_PATH"
    else
        LOCAL_DIR=$(dirname "$LOCAL_PATH")
    fi
    mkdir -p "$LOCAL_DIR"

    if [[ "$REMOTE_PATH" == */ ]]; then
        # Directory sync
        rclone sync "$FULL_REMOTE" "$LOCAL_PATH" --update 2>&1
    else
        # Single file
        rclone copyto "$FULL_REMOTE" "$LOCAL_PATH" --update 2>&1
    fi
}
```

- [ ] **Step 2: Verify driver loads and check function works**

Run: `source core/hooks/backends/backend-drive.sh && backup_check && echo "OK" || echo "FAIL: $?"`
Expected: OK (if rclone is configured) or a clear error message.

- [ ] **Step 3: Commit**

```bash
git add core/hooks/backends/backend-drive.sh
git commit -m "feat: add Google Drive backend driver

Implements push/pull/check interface for rclone-based Drive backup.
Uses --checksum for push, --update for pull. Supports both file and
directory operations."
```

### Task 3b: GitHub Backend Driver

- [ ] **Step 1: Write `backend-github.sh`**

```bash
#!/usr/bin/env bash
# backend-github.sh — Private GitHub repo backend driver for backup engine
# Implements: backup_push, backup_pull, backup_check
# Requires: git installed, BACKUP_REPO_URL set by engine

# BACKUP_REPO_URL and BACKUP_REPO_DIR are set by the calling engine
BACKUP_REPO_DIR="${BACKUP_REPO_DIR:-$HOME/.claude/toolkit-state/backup-repo}"

backup_check() {
    if ! command -v git &>/dev/null; then
        echo "git not installed" >&2
        return 1
    fi
    if [[ -z "${BACKUP_REPO_URL:-}" ]]; then
        echo "No backup repo URL configured" >&2
        return 1
    fi
    # Check if repo is cloned
    if [[ ! -d "$BACKUP_REPO_DIR/.git" ]]; then
        # Try to clone
        if ! git clone "$BACKUP_REPO_URL" "$BACKUP_REPO_DIR" 2>&1; then
            echo "Cannot clone backup repo: $BACKUP_REPO_URL" >&2
            return 1
        fi
    fi
    return 0
}

backup_push() {
    local LOCAL_PATH="$1"
    local REMOTE_PATH="$2"
    local TARGET="$BACKUP_REPO_DIR/$REMOTE_PATH"

    # Ensure target directory exists
    local TARGET_DIR
    if [[ -d "$LOCAL_PATH" ]]; then
        TARGET_DIR="$TARGET"
    else
        TARGET_DIR=$(dirname "$TARGET")
    fi
    mkdir -p "$TARGET_DIR"

    # Copy local → repo checkout
    if [[ -d "$LOCAL_PATH" ]]; then
        # Sync directory (delete removed files)
        rsync -a --delete "$LOCAL_PATH/" "$TARGET/" 2>/dev/null || cp -R "$LOCAL_PATH/." "$TARGET/"
    else
        cp "$LOCAL_PATH" "$TARGET"
    fi

    # Commit and push
    cd "$BACKUP_REPO_DIR" || return 1
    git add -A
    if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "auto: backup $(date +%Y-%m-%dT%H:%M:%S)" --no-gpg-sign 2>&1
        git push origin main 2>&1 || {
            echo "Push failed — will retry next cycle" >&2
            return 1
        }
    fi
}

backup_pull() {
    local REMOTE_PATH="$1"
    local LOCAL_PATH="$2"

    # Ensure repo is up to date
    if [[ -d "$BACKUP_REPO_DIR/.git" ]]; then
        cd "$BACKUP_REPO_DIR" || return 1
        git pull origin main 2>&1 || {
            echo "Pull failed" >&2
            return 1
        }
    else
        echo "Backup repo not cloned" >&2
        return 1
    fi

    local SOURCE="$BACKUP_REPO_DIR/$REMOTE_PATH"
    [[ ! -e "$SOURCE" ]] && return 0  # Nothing to pull

    local LOCAL_DIR
    if [[ "$REMOTE_PATH" == */ ]]; then
        LOCAL_DIR="$LOCAL_PATH"
    else
        LOCAL_DIR=$(dirname "$LOCAL_PATH")
    fi
    mkdir -p "$LOCAL_DIR"

    if [[ -d "$SOURCE" ]]; then
        rsync -a "$SOURCE/" "$LOCAL_PATH/" 2>/dev/null || cp -R "$SOURCE/." "$LOCAL_PATH/"
    else
        cp "$SOURCE" "$LOCAL_PATH"
    fi
}
```

- [ ] **Step 2: Commit**

```bash
git add core/hooks/backends/backend-github.sh
git commit -m "feat: add private GitHub backend driver

Implements push/pull/check interface for git-based backup. Auto-clones
repo on first use. Uses simple add-commit-push (no rebase). Push
failures are logged, not fatal."
```

### Task 3c: iCloud Backend Driver

- [ ] **Step 1: Write `backend-icloud.sh`**

```bash
#!/usr/bin/env bash
# backend-icloud.sh — iCloud Drive backend driver for backup engine
# Implements: backup_push, backup_pull, backup_check
# macOS only — uses iCloud Drive path directly

ICLOUD_BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Claude/Backup"

backup_check() {
    if [[ "$(uname)" != "Darwin" ]]; then
        echo "iCloud backend is macOS only" >&2
        return 1
    fi
    # Check if iCloud Drive path exists
    if [[ ! -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/" ]]; then
        echo "iCloud Drive not available" >&2
        return 1
    fi
    mkdir -p "$ICLOUD_BASE"
    return 0
}

backup_push() {
    local LOCAL_PATH="$1"
    local REMOTE_PATH="$2"
    local TARGET="$ICLOUD_BASE/$REMOTE_PATH"

    local TARGET_DIR
    if [[ -d "$LOCAL_PATH" ]]; then
        TARGET_DIR="$TARGET"
    else
        TARGET_DIR=$(dirname "$TARGET")
    fi
    mkdir -p "$TARGET_DIR"

    if [[ -d "$LOCAL_PATH" ]]; then
        rsync -a --delete "$LOCAL_PATH/" "$TARGET/" 2>/dev/null || cp -R "$LOCAL_PATH/." "$TARGET/"
    else
        cp "$LOCAL_PATH" "$TARGET"
    fi
}

backup_pull() {
    local REMOTE_PATH="$1"
    local LOCAL_PATH="$2"
    local SOURCE="$ICLOUD_BASE/$REMOTE_PATH"

    [[ ! -e "$SOURCE" ]] && return 0  # Nothing to pull

    local LOCAL_DIR
    if [[ "$REMOTE_PATH" == */ ]]; then
        LOCAL_DIR="$LOCAL_PATH"
    else
        LOCAL_DIR=$(dirname "$LOCAL_PATH")
    fi
    mkdir -p "$LOCAL_DIR"

    if [[ -d "$SOURCE" ]]; then
        rsync -a "$SOURCE/" "$LOCAL_PATH/" 2>/dev/null || cp -R "$SOURCE/." "$LOCAL_PATH/"
    else
        cp "$SOURCE" "$LOCAL_PATH"
    fi
}
```

- [ ] **Step 2: Commit**

```bash
git add core/hooks/backends/backend-icloud.sh
git commit -m "feat: add iCloud backend driver

macOS-only driver using direct filesystem access to iCloud Drive.
Last-write-wins conflict strategy (acceptable for single-device
personal data). Falls back to cp if rsync unavailable."
```

---

## Task 4: Backup Engine

**Files:**
- Create: `core/hooks/backup-engine.sh`

This is the core replacement for git-sync.sh, personal-sync.sh, and drive-archive.sh. It's the largest single file.

- [ ] **Step 1: Write the engine — config reading and file classification**

The engine's first section: parse stdin, read config, load manifest, classify the file.

```bash
#!/usr/bin/env bash
# backup-engine.sh — Unified backup engine for DestinClaude
# Replaces: git-sync.sh, personal-sync.sh, drive-archive.sh
# Trigger: PostToolUse hook on Write/Edit
# Also callable in pull/restore mode: bash backup-engine.sh --pull | --restore

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
TOOLKIT_STATE="$CLAUDE_DIR/toolkit-state"
CONFIG_FILE="$TOOLKIT_STATE/config.json"
MANIFEST_FILE=""  # Set after TOOLKIT_ROOT resolution
SCHEMA_FILE=""    # Set after TOOLKIT_ROOT resolution
BACKUP_LOG="$CLAUDE_DIR/backup.log"
LOCK_DIR="$CLAUDE_DIR/.backup-lock"
REGISTRY_FILE="$CLAUDE_DIR/.write-registry.json"

# --- Mode detection ---
MODE="push"  # default: PostToolUse hook
[[ "${1:-}" == "--pull" ]] && MODE="pull"
[[ "${1:-}" == "--restore" ]] && MODE="restore"

# --- Logging ---
log_msg() {
    local MSG="$1"
    local TIMESTAMP
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] [backup-engine] $MSG" >> "$BACKUP_LOG"
}

# --- Config reading ---
read_config() {
    local KEY="$1"
    local DEFAULT="${2:-}"
    if [[ -f "$CONFIG_FILE" ]]; then
        local VAL
        VAL=$(node -e "
            try {
                const c = require('$CONFIG_FILE');
                // Support old key names (D10 migration)
                const migrations = {
                    'primary_backend': ['PERSONAL_SYNC_BACKEND'],
                    'primary_backend_repo': ['PERSONAL_SYNC_REPO']
                };
                let v = c['$KEY'];
                if (v === undefined && migrations['$KEY']) {
                    for (const old of migrations['$KEY']) {
                        if (c[old] !== undefined) { v = c[old]; break; }
                    }
                }
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " 2>/dev/null)
        echo "${VAL:-$DEFAULT}"
    else
        echo "$DEFAULT"
    fi
}

# --- Resolve TOOLKIT_ROOT ---
TOOLKIT_ROOT=$(read_config "toolkit_root" "")
if [[ -z "$TOOLKIT_ROOT" ]]; then
    # Fallback: walk up from this script's location
    SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")")" && pwd)"
    WALK="$SCRIPT_DIR"
    while [[ "$WALK" != "/" && "$WALK" != "." ]]; do
        if [[ -f "$WALK/VERSION" && -f "$WALK/plugin.json" ]]; then
            TOOLKIT_ROOT="$WALK"
            break
        fi
        WALK=$(dirname "$WALK")
    done
fi

# Set manifest and schema paths
[[ -n "$TOOLKIT_ROOT" ]] && MANIFEST_FILE="$TOOLKIT_ROOT/plugin-manifest.json"
[[ -n "$TOOLKIT_ROOT" ]] && SCHEMA_FILE="$TOOLKIT_ROOT/backup-schema.json"

# --- Read backend config ---
PRIMARY_BACKEND=$(read_config "primary_backend" "none")
PRIMARY_BACKEND_REPO=$(read_config "primary_backend_repo" "")
SECONDARY_BACKEND=$(read_config "secondary_backend" "none")
SECONDARY_BACKEND_REPO=$(read_config "secondary_backend_repo" "")
DRIVE_ROOT=$(read_config "DRIVE_ROOT" "Claude")

# --- Load backend driver ---
load_driver() {
    local BACKEND="$1"
    local DRIVER_DIR
    if [[ -n "$TOOLKIT_ROOT" ]]; then
        DRIVER_DIR="$TOOLKIT_ROOT/core/hooks/backends"
    else
        DRIVER_DIR="$(dirname "${BASH_SOURCE[0]}")/backends"
    fi
    local DRIVER_FILE="$DRIVER_DIR/backend-${BACKEND}.sh"
    if [[ -f "$DRIVER_FILE" ]]; then
        source "$DRIVER_FILE"
        return 0
    else
        log_msg "ERROR: Backend driver not found: $DRIVER_FILE"
        return 1
    fi
}

# --- File classification ---
# Returns: "personal", "extension", "toolkit", "excluded", "external"
classify_file() {
    local FILE_PATH="$1"

    # Normalize path
    FILE_PATH="${FILE_PATH//\\//}"

    # Check exclusions first (fast path)
    case "$FILE_PATH" in
        */.env|*token*|*secret*|*credential*) echo "excluded"; return ;;
        */node_modules/*|*/__pycache__/*|*/.venv/*) echo "excluded"; return ;;
        */sessions/*|*/tasks/*|*/shell-snapshots/*) echo "excluded"; return ;;
        *settings.json|*settings.local.json|*.claude.json) echo "excluded"; return ;;
        *.lock|*.lock/*) echo "excluded"; return ;;
    esac

    # Check if it's in the CLAUDE_DIR at all
    local CLAUDE_DIR_NORM="${CLAUDE_DIR//\\//}"
    if [[ "$FILE_PATH" != "$CLAUDE_DIR_NORM"* ]]; then
        echo "external"
        return
    fi

    # Check manifest (toolkit-owned)
    if [[ -f "$MANIFEST_FILE" ]]; then
        local REL_PATH="${FILE_PATH#$CLAUDE_DIR_NORM/}"

        # Check skills
        if [[ "$REL_PATH" == skills/* ]]; then
            local SKILL_NAME
            SKILL_NAME=$(echo "$REL_PATH" | sed 's|skills/\([^/]*\)/.*|\1|')
            local IS_TOOLKIT
            IS_TOOLKIT=$(node -e "
                try {
                    const m = require('$MANIFEST_FILE');
                    console.log(m.owned_files.skills.includes('$SKILL_NAME') ? 'yes' : 'no');
                } catch(e) { console.log('no'); }
            " 2>/dev/null)
            if [[ "$IS_TOOLKIT" == "yes" ]]; then
                echo "toolkit"
                return
            fi
            echo "extension"
            return
        fi

        # Check hooks
        if [[ "$REL_PATH" == hooks/* ]]; then
            local HOOK_NAME
            HOOK_NAME=$(basename "$REL_PATH")
            local IS_TOOLKIT
            IS_TOOLKIT=$(node -e "
                try {
                    const m = require('$MANIFEST_FILE');
                    const all = [...(m.owned_files.hooks||[]), ...(m.owned_files.utility_scripts||[])];
                    console.log(all.includes('$HOOK_NAME') ? 'yes' : 'no');
                } catch(e) { console.log('no'); }
            " 2>/dev/null)
            if [[ "$IS_TOOLKIT" == "yes" ]]; then
                echo "toolkit"
                return
            fi
            echo "extension"
            return
        fi

        # Check specs/commands (always toolkit-owned)
        if [[ "$REL_PATH" == specs/* || "$REL_PATH" == commands/* ]]; then
            echo "toolkit"
            return
        fi
    fi

    # Check personal data patterns
    case "$FILE_PATH" in
        */projects/*/memory/*) echo "personal"; return ;;
        */CLAUDE.md) echo "personal"; return ;;
        */keybindings.json) echo "personal"; return ;;
        */projects/*/*.jsonl) echo "personal"; return ;;
        */encyclopedia/*) echo "personal"; return ;;
        */toolkit-state/config.json) echo "personal"; return ;;
    esac

    # Default: not classified as backupable
    echo "excluded"
}

# --- Canonical path mapping ---
map_to_canonical() {
    local FILE_PATH="$1"
    local CLAUDE_DIR_NORM="${CLAUDE_DIR//\\//}"
    FILE_PATH="${FILE_PATH//\\//}"

    case "$FILE_PATH" in
        */projects/*/memory/*)
            local PROJECT_KEY
            PROJECT_KEY=$(echo "$FILE_PATH" | sed "s|.*projects/\([^/]*\)/memory/.*|\1|")
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "memory/$PROJECT_KEY/$FILE_NAME"
            ;;
        */CLAUDE.md)
            echo "claude-md/CLAUDE.md"
            ;;
        */keybindings.json)
            echo "config/keybindings.json"
            ;;
        */toolkit-state/config.json)
            echo "config/user-choices.json"
            ;;
        */projects/*/*.jsonl)
            local PROJECT_KEY
            PROJECT_KEY=$(echo "$FILE_PATH" | sed "s|.*projects/\([^/]*\)/.*|\1|")
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "conversations/$PROJECT_KEY/$FILE_NAME"
            ;;
        */encyclopedia/*)
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "encyclopedia/$FILE_NAME"
            ;;
        */skills/*)
            local SKILL_NAME
            SKILL_NAME=$(echo "$FILE_PATH" | sed "s|.*skills/\([^/]*\)/.*|\1|")
            local REL
            REL=$(echo "$FILE_PATH" | sed "s|.*skills/$SKILL_NAME/||")
            echo "extensions/skills/$SKILL_NAME/$REL"
            ;;
        *)
            echo ""  # No canonical mapping
            ;;
    esac
}
```

- [ ] **Step 2: Write the engine — mutex, debounce, push logic**

Append to `backup-engine.sh`:

```bash
# --- Mutex ---
acquire_lock() {
    local RETRIES=30
    while ! mkdir "$LOCK_DIR" 2>/dev/null; do
        RETRIES=$((RETRIES - 1))
        if [[ $RETRIES -le 0 ]]; then
            # Check for stale lock (>2 minutes)
            local LOCK_AGE=0
            if [[ -f "$LOCK_DIR/pid" ]]; then
                local LOCK_TIME
                LOCK_TIME=$(cat "$LOCK_DIR/pid" 2>/dev/null | tail -1)
                local NOW
                NOW=$(date +%s)
                LOCK_AGE=$(( NOW - ${LOCK_TIME:-0} ))
            fi
            if [[ $LOCK_AGE -gt 120 ]]; then
                rm -rf "$LOCK_DIR" 2>/dev/null
                mkdir "$LOCK_DIR" 2>/dev/null && break
            fi
            log_msg "ERROR: Could not acquire lock after 30 retries"
            return 1
        fi
        sleep 1
    done
    echo "$$" > "$LOCK_DIR/pid"
    date +%s >> "$LOCK_DIR/pid"
}

release_lock() {
    rm -rf "$LOCK_DIR" 2>/dev/null
}

# --- Debounce ---
check_debounce() {
    local BACKEND="$1"
    local MARKER="$CLAUDE_DIR/.push-marker-${BACKEND}"
    local INTERVAL=900  # 15 minutes

    if [[ ! -f "$MARKER" ]]; then
        return 0  # No marker — push now
    fi

    local LAST_PUSH
    LAST_PUSH=$(cat "$MARKER" 2>/dev/null || echo "0")
    local NOW
    NOW=$(date +%s)
    local ELAPSED=$(( NOW - LAST_PUSH ))

    if [[ $ELAPSED -ge $INTERVAL ]]; then
        return 0  # Debounce expired — push now
    fi
    return 1  # Too soon — skip
}

update_debounce() {
    local BACKEND="$1"
    local MARKER="$CLAUDE_DIR/.push-marker-${BACKEND}"
    date +%s > "$MARKER"
}

# --- Write registry update (for write-guard.sh) ---
update_registry() {
    local FILE_PATH="$1"
    local CONTENT_HASH
    if [[ -f "$FILE_PATH" ]]; then
        CONTENT_HASH=$(sha256sum "$FILE_PATH" 2>/dev/null | head -c 16 || echo "unknown")
    else
        CONTENT_HASH="deleted"
    fi

    node -e "
        const fs = require('fs');
        const path = '$REGISTRY_FILE';
        const filePath = '${FILE_PATH//\'/\\\'}';
        let reg = {};
        try { reg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
        reg[filePath] = {
            pid: $PPID,
            timestamp: Date.now(),
            content_hash: '$CONTENT_HASH'
        };
        fs.writeFileSync(path, JSON.stringify(reg, null, 2));
    " 2>/dev/null
}

# --- Push to backend ---
push_to_backend() {
    local BACKEND="$1"
    local LOCAL_PATH="$2"
    local CANONICAL_PATH="$3"

    # Set backend-specific env vars
    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    if [[ "$BACKEND" == "$SECONDARY_BACKEND" ]]; then
        export BACKUP_REPO_URL="$SECONDARY_BACKEND_REPO"
        export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo-secondary"
    fi

    load_driver "$BACKEND" || return 1
    backup_push "$LOCAL_PATH" "$CANONICAL_PATH"
}

# --- Check if file is high-value (for secondary backup) ---
is_high_value() {
    local CANONICAL_PATH="$1"
    case "$CANONICAL_PATH" in
        memory/*|claude-md/*|extensions/skills/*) return 0 ;;
        *) return 1 ;;
    esac
}
```

- [ ] **Step 3: Write the engine — main push mode logic**

Append to `backup-engine.sh`:

```bash
# --- Extract user-choice keys for config backup ---
extract_user_choices() {
    local CONFIG="$1"
    local OUTPUT="$2"
    [[ ! -f "$SCHEMA_FILE" ]] && return 1
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
        const schema = JSON.parse(fs.readFileSync('$SCHEMA_FILE', 'utf8'));
        const result = {};
        for (const key of schema.user_choice_keys) {
            if (config[key] !== undefined) result[key] = config[key];
        }
        fs.writeFileSync('$OUTPUT', JSON.stringify(result, null, 2));
    " 2>/dev/null
}

# ==============================================================
# MAIN: Push mode (PostToolUse hook)
# ==============================================================
if [[ "$MODE" == "push" ]]; then
    # Parse stdin JSON
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try {
                const j=JSON.parse(d);
                const p=j.tool_input?.file_path || j.file_path || '';
                process.stdout.write(p.replace(/\\\\/g,'/'));
            } catch(e) {}
        });
    " 2>/dev/null)

    [[ -z "$FILE_PATH" ]] && exit 0

    # Classify
    CLASSIFICATION=$(classify_file "$FILE_PATH")

    # Update write registry regardless of classification (for write-guard)
    if [[ "$CLASSIFICATION" != "external" ]]; then
        update_registry "$FILE_PATH"
    fi

    # Exit if not backupable
    if [[ "$CLASSIFICATION" == "toolkit" || "$CLASSIFICATION" == "excluded" ]]; then
        exit 0
    fi

    # Handle user extensions — check if user has approved this extension
    if [[ "$CLASSIFICATION" == "extension" ]]; then
        local EXT_NAME
        EXT_NAME=$(basename "$(dirname "$FILE_PATH")")
        local APPROVED
        APPROVED=$(node -e "
            try {
                const c = require('$CONFIG_FILE');
                const exts = c.user_extensions || {};
                const skills = exts.skills || [];
                const hooks = exts.hooks || [];
                console.log([...skills, ...hooks].includes('$EXT_NAME') ? 'yes' : 'no');
            } catch(e) { console.log('no'); }
        " 2>/dev/null)
        if [[ "$APPROVED" != "yes" ]]; then
            exit 0  # Not approved for backup — skip silently
        fi
    fi

    # Map to canonical path
    CANONICAL=$(map_to_canonical "$FILE_PATH")
    [[ -z "$CANONICAL" ]] && exit 0

    # Special handling: config.json → extract user-choice keys only
    if [[ "$CANONICAL" == "config/user-choices.json" ]]; then
        TEMP_CHOICES=$(mktemp)
        extract_user_choices "$FILE_PATH" "$TEMP_CHOICES" || exit 0
        FILE_PATH="$TEMP_CHOICES"
        trap "rm -f '$TEMP_CHOICES'" EXIT
    fi

    # Primary backend push (debounced)
    if [[ "$PRIMARY_BACKEND" != "none" ]]; then
        if check_debounce "$PRIMARY_BACKEND"; then
            acquire_lock || exit 0
            trap "release_lock" EXIT

            if push_to_backend "$PRIMARY_BACKEND" "$FILE_PATH" "$CANONICAL"; then
                update_debounce "$PRIMARY_BACKEND"
                log_msg "OK: Pushed $CANONICAL to $PRIMARY_BACKEND"

                # Write sync status for statusline
                echo "OK: Changes Synced" > "$CLAUDE_DIR/.sync-status"
            else
                log_msg "ERROR: Failed to push $CANONICAL to $PRIMARY_BACKEND"
                echo "ERR: Sync Failed" > "$CLAUDE_DIR/.sync-status"
            fi

            release_lock
            trap - EXIT
        fi
    fi

    # Secondary backend push (high-value only, best-effort, non-blocking)
    if [[ "$SECONDARY_BACKEND" != "none" && "$SECONDARY_BACKEND" != "" ]]; then
        if is_high_value "$CANONICAL"; then
            if check_debounce "$SECONDARY_BACKEND"; then
                (
                    push_to_backend "$SECONDARY_BACKEND" "$FILE_PATH" "$CANONICAL" 2>/dev/null &&
                    update_debounce "$SECONDARY_BACKEND" &&
                    log_msg "OK: Mirrored $CANONICAL to secondary ($SECONDARY_BACKEND)"
                ) &
            fi
        fi
    fi

    exit 0
fi

# ==============================================================
# PULL mode (called by session-start)
# ==============================================================
if [[ "$MODE" == "pull" ]]; then
    [[ "$PRIMARY_BACKEND" == "none" ]] && exit 0

    # Load schema for path mappings
    [[ ! -f "$SCHEMA_FILE" ]] && { log_msg "ERROR: Schema file not found"; exit 1; }

    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    load_driver "$PRIMARY_BACKEND" || { log_msg "ERROR: Cannot load $PRIMARY_BACKEND driver"; exit 1; }

    # Check backend reachable
    if ! backup_check 2>/dev/null; then
        log_msg "WARN: Primary backend ($PRIMARY_BACKEND) unreachable — skipping pull"
        exit 0
    fi

    # Pull to temp directory first (D11: safe migration)
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf '$TEMP_DIR'" EXIT

    # Pull each category
    ERRORS=0
    backup_pull "memory/" "$TEMP_DIR/memory/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "claude-md/CLAUDE.md" "$TEMP_DIR/claude-md/CLAUDE.md" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "config/" "$TEMP_DIR/config/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "conversations/" "$TEMP_DIR/conversations/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "encyclopedia/" "$TEMP_DIR/encyclopedia/" 2>/dev/null || ERRORS=$((ERRORS+1))

    # Check for schema migration
    if [[ -f "$TEMP_DIR/backup-schema.json" ]]; then
        local BACKUP_VERSION
        BACKUP_VERSION=$(node -e "try{console.log(require('$TEMP_DIR/backup-schema.json').schema_version)}catch(e){console.log(0)}" 2>/dev/null)
        local CURRENT_VERSION
        CURRENT_VERSION=$(node -e "try{console.log(require('$SCHEMA_FILE').schema_version)}catch(e){console.log(1)}" 2>/dev/null)

        if [[ "$BACKUP_VERSION" -lt "$CURRENT_VERSION" ]]; then
            log_msg "Migrating backup schema v$BACKUP_VERSION → v$CURRENT_VERSION"
            local V=$BACKUP_VERSION
            while [[ $V -lt $CURRENT_VERSION ]]; do
                local NEXT=$((V+1))
                local MIGRATION="$TOOLKIT_ROOT/core/migrations/v${V}-to-v${NEXT}.sh"
                if [[ -f "$MIGRATION" ]]; then
                    bash "$MIGRATION" "$TEMP_DIR" || {
                        log_msg "ERROR: Migration v${V}→v${NEXT} failed — aborting pull"
                        exit 1
                    }
                fi
                V=$NEXT
            done
        fi
    fi

    # Copy from temp to final local paths (never overwrite toolkit files)
    # Memory
    if [[ -d "$TEMP_DIR/memory" ]]; then
        for PROJECT_DIR in "$TEMP_DIR"/memory/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            LOCAL_MEM="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
            mkdir -p "$LOCAL_MEM"
            cp -R "$PROJECT_DIR"* "$LOCAL_MEM/" 2>/dev/null
        done
    fi

    # CLAUDE.md (only if not a fresh install — session-start pull shouldn't overwrite wizard output)
    # Pull mode overwrites; restore mode (Phase 5R) uses merge prompt instead
    if [[ -f "$TEMP_DIR/claude-md/CLAUDE.md" ]]; then
        cp "$TEMP_DIR/claude-md/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    fi

    # Keybindings
    if [[ -f "$TEMP_DIR/config/keybindings.json" ]]; then
        cp "$TEMP_DIR/config/keybindings.json" "$CLAUDE_DIR/keybindings.json"
    fi

    # User-choice config merge
    if [[ -f "$TEMP_DIR/config/user-choices.json" && -f "$CONFIG_FILE" ]]; then
        node -e "
            const fs = require('fs');
            const choices = JSON.parse(fs.readFileSync('$TEMP_DIR/config/user-choices.json', 'utf8'));
            const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
            // Only merge keys that aren't already set locally
            for (const [k, v] of Object.entries(choices)) {
                if (config[k] === undefined || config[k] === null || config[k] === '') {
                    config[k] = v;
                }
            }
            fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        " 2>/dev/null
    fi

    # Conversations
    if [[ -d "$TEMP_DIR/conversations" ]]; then
        for PROJECT_DIR in "$TEMP_DIR"/conversations/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            LOCAL_CONV="$CLAUDE_DIR/projects/$PROJECT_KEY"
            mkdir -p "$LOCAL_CONV"
            cp "$PROJECT_DIR"*.jsonl "$LOCAL_CONV/" 2>/dev/null
        done
    fi

    # Encyclopedia
    if [[ -d "$TEMP_DIR/encyclopedia" ]]; then
        mkdir -p "$CLAUDE_DIR/encyclopedia"
        cp "$TEMP_DIR"/encyclopedia/* "$CLAUDE_DIR/encyclopedia/" 2>/dev/null
    fi

    rm -rf "$TEMP_DIR"
    trap - EXIT

    if [[ $ERRORS -eq 0 ]]; then
        log_msg "OK: Pull from $PRIMARY_BACKEND completed"
    else
        log_msg "WARN: Pull from $PRIMARY_BACKEND completed with $ERRORS errors"
    fi

    exit 0
fi

# ==============================================================
# RESTORE mode (called by setup wizard Phase 5R or /restore)
# ==============================================================
if [[ "$MODE" == "restore" ]]; then
    # Restore mode outputs JSON instructions for the calling skill/command
    # to interpret. The actual interactive prompts (CLAUDE.md merge, custom
    # skill confirmation) are handled by the skill, not this script.

    [[ "$PRIMARY_BACKEND" == "none" ]] && {
        echo '{"status":"no_backend","message":"No backup backend configured"}'
        exit 0
    }

    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    load_driver "$PRIMARY_BACKEND" || {
        echo '{"status":"error","message":"Cannot load backend driver"}'
        exit 1
    }

    if ! backup_check 2>/dev/null; then
        echo '{"status":"unreachable","message":"Backup backend is not reachable"}'
        exit 1
    fi

    # Pull everything to temp dir
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf '$TEMP_DIR'" EXIT

    backup_pull "" "$TEMP_DIR/" 2>/dev/null

    # Read schema and report what's available
    SCHEMA_VERSION=0
    [[ -f "$TEMP_DIR/backup-schema.json" ]] && \
        SCHEMA_VERSION=$(node -e "try{console.log(require('$TEMP_DIR/backup-schema.json').schema_version)}catch(e){console.log(0)}" 2>/dev/null)

    # Enumerate available data
    HAS_MEMORY=$([[ -d "$TEMP_DIR/memory" ]] && echo "true" || echo "false")
    HAS_CLAUDE_MD=$([[ -f "$TEMP_DIR/claude-md/CLAUDE.md" ]] && echo "true" || echo "false")
    HAS_KEYBINDINGS=$([[ -f "$TEMP_DIR/config/keybindings.json" ]] && echo "true" || echo "false")
    HAS_CONVERSATIONS=$([[ -d "$TEMP_DIR/conversations" ]] && echo "true" || echo "false")
    HAS_ENCYCLOPEDIA=$([[ -d "$TEMP_DIR/encyclopedia" ]] && echo "true" || echo "false")
    HAS_EXTENSIONS=$([[ -d "$TEMP_DIR/extensions/skills" ]] && echo "true" || echo "false")
    HAS_USER_CHOICES=$([[ -f "$TEMP_DIR/config/user-choices.json" ]] && echo "true" || echo "false")

    # List custom skills
    CUSTOM_SKILLS="[]"
    if [[ -d "$TEMP_DIR/extensions/skills" ]]; then
        CUSTOM_SKILLS=$(node -e "
            const fs = require('fs');
            const dirs = fs.readdirSync('$TEMP_DIR/extensions/skills').filter(d =>
                fs.statSync('$TEMP_DIR/extensions/skills/' + d).isDirectory());
            console.log(JSON.stringify(dirs));
        " 2>/dev/null)
    fi

    # Output inventory as JSON for the calling skill to interpret
    echo "{
        \"status\": \"ok\",
        \"temp_dir\": \"$TEMP_DIR\",
        \"schema_version\": $SCHEMA_VERSION,
        \"available\": {
            \"memory\": $HAS_MEMORY,
            \"claude_md\": $HAS_CLAUDE_MD,
            \"keybindings\": $HAS_KEYBINDINGS,
            \"conversations\": $HAS_CONVERSATIONS,
            \"encyclopedia\": $HAS_ENCYCLOPEDIA,
            \"extensions\": $HAS_EXTENSIONS,
            \"user_choices\": $HAS_USER_CHOICES
        },
        \"custom_skills\": $CUSTOM_SKILLS
    }"

    # NOTE: Don't clean up temp_dir here — the calling skill needs it.
    # The skill is responsible for cleanup after interactive restore.
    trap - EXIT
    exit 0
fi
```

- [ ] **Step 4: Make the engine executable**

Run: `chmod +x core/hooks/backup-engine.sh`

- [ ] **Step 5: Verify the engine parses a sample JSON input**

Run: `echo '{"tool_input":{"file_path":"/c/Users/desti/.claude/projects/C--Users-desti/memory/user_profile.md"}}' | bash core/hooks/backup-engine.sh 2>/dev/null; echo "Exit: $?"`
Expected: Exit 0 (no error, but no actual push since debounce/backend checks)

- [ ] **Step 6: Commit**

```bash
git add core/hooks/backup-engine.sh
git commit -m "feat: add unified backup engine

Single script replacing git-sync.sh, personal-sync.sh, and
drive-archive.sh. Implements push/pull/restore modes with pluggable
backend drivers, manifest-based file classification, canonical path
mapping, debounce, mutex locking, write registry, and safe migration
via temp directory."
```

---

## Task 5: Config Migration

**Files:**
- Modify: `core/hooks/backup-engine.sh` (add migration function)

- [ ] **Step 1: Add config key migration function to the engine**

Add after the `read_config` function in `backup-engine.sh`:

```bash
# --- Config key migration (D10) ---
migrate_config_keys() {
    [[ ! -f "$CONFIG_FILE" ]] && return
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
        let changed = false;

        // PERSONAL_SYNC_BACKEND → primary_backend
        if (config.PERSONAL_SYNC_BACKEND && !config.primary_backend) {
            config.primary_backend = config.PERSONAL_SYNC_BACKEND;
            delete config.PERSONAL_SYNC_BACKEND;
            changed = true;
        }

        // PERSONAL_SYNC_REPO → primary_backend_repo (if primary was github)
        if (config.PERSONAL_SYNC_REPO && !config.primary_backend_repo) {
            config.primary_backend_repo = config.PERSONAL_SYNC_REPO;
            delete config.PERSONAL_SYNC_REPO;
            changed = true;
        }

        if (changed) {
            fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        }
    " 2>/dev/null
}
```

Call `migrate_config_keys` early in the engine, right after `TOOLKIT_ROOT` resolution and before reading backend config.

- [ ] **Step 2: Commit**

```bash
git add core/hooks/backup-engine.sh
git commit -m "feat: add config key migration (D10)

Migrates PERSONAL_SYNC_BACKEND → primary_backend and
PERSONAL_SYNC_REPO → primary_backend_repo on first run.
Old keys are removed after migration."
```

---

## Task 6: Toolkit Integrity Check in Session-Start

**Files:**
- Modify: `core/hooks/session-start.sh` (lines ~11-33, add new section after TOOLKIT_ROOT resolution)

- [ ] **Step 1: Add `verify_toolkit_integrity` function**

Insert after the TOOLKIT_ROOT resolution block (after line ~33 in session-start.sh):

```bash
# --- Toolkit integrity check (D4) ---
verify_toolkit_integrity() {
    local TR="$1"
    [[ -z "$TR" ]] && return 1

    # Fast checks
    [[ ! -d "$TR" ]] && return 1
    [[ ! -f "$TR/VERSION" ]] && return 1
    [[ ! -f "$TR/plugin.json" ]] && return 1
    [[ ! -d "$TR/.git" ]] && return 1

    # Check installed layers
    local LAYERS
    LAYERS=$(node -e "
        try {
            const c = require('$CLAUDE_DIR/toolkit-state/config.json');
            console.log((c.installed_layers || ['core']).join(' '));
        } catch(e) { console.log('core'); }
    " 2>/dev/null)

    for LAYER in $LAYERS; do
        [[ ! -d "$TR/$LAYER" ]] && return 1
    done

    return 0
}

# Run integrity check
if [[ -n "$TOOLKIT_ROOT" ]] && ! verify_toolkit_integrity "$TOOLKIT_ROOT"; then
    log_msg "Toolkit integrity check failed — attempting auto-recovery"

    # Determine repo URL
    REPO_URL="https://github.com/destinclaude/destinclaude.git"

    if [[ -d "$TOOLKIT_ROOT/.git" ]]; then
        # Partial — try git pull
        cd "$TOOLKIT_ROOT" && git pull origin master 2>/dev/null && cd - >/dev/null
    else
        # Missing — clone fresh
        rm -rf "$TOOLKIT_ROOT" 2>/dev/null
        git clone "$REPO_URL" "$TOOLKIT_ROOT" 2>/dev/null
    fi

    if verify_toolkit_integrity "$TOOLKIT_ROOT"; then
        log_msg "Toolkit auto-recovered successfully"
        # Re-register symlinks/hooks
        # (Uses the same logic as setup wizard Phase 5 Step 5)
        echo '{"hookSpecificOutput":{"message":"Your DestinClaude toolkit was missing or damaged and has been automatically restored. All your personal data is untouched."}}' >&3 2>/dev/null || true
    else
        log_msg "ERROR: Toolkit auto-recovery failed"
        echo '{"hookSpecificOutput":{"message":"Warning: Your DestinClaude toolkit could not be restored automatically. Run /setup-wizard when you are back online."}}' >&3 2>/dev/null || true
    fi
fi
```

- [ ] **Step 2: Commit**

```bash
git add core/hooks/session-start.sh
git commit -m "feat: add toolkit integrity check with auto-recovery (D4)

Session-start now verifies toolkit_root contains VERSION, plugin.json,
.git, and all installed layer directories. If any check fails,
auto-clones from GitHub or pulls if .git exists. Notifies user of
recovery or degraded mode."
```

---

## Task 7: Session-Start Pull Refactor

**Files:**
- Modify: `core/hooks/session-start.sh` (lines ~146-200, replace personal data pull)

- [ ] **Step 1: Replace the personal data pull section with engine call**

Replace the personal data pull block (lines ~146-200) with:

```bash
# --- Personal data pull (via backup engine) ---
BACKUP_ENGINE=""
if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/core/hooks/backup-engine.sh" ]]; then
    BACKUP_ENGINE="$TOOLKIT_ROOT/core/hooks/backup-engine.sh"
elif [[ -f "$CLAUDE_DIR/hooks/backup-engine.sh" ]]; then
    BACKUP_ENGINE="$CLAUDE_DIR/hooks/backup-engine.sh"
fi

if [[ -n "$BACKUP_ENGINE" ]]; then
    bash "$BACKUP_ENGINE" --pull 2>/dev/null || {
        log_msg "WARN: Personal data pull failed"
    }
fi
```

This replaces ~55 lines of inline Drive/GitHub pull logic with a single engine call.

- [ ] **Step 2: Update sync health check to use new config keys**

In the sync health check section (~lines 208-256), update the personal data backend detection to read `primary_backend` (with fallback to `PERSONAL_SYNC_BACKEND` for migration):

```bash
# Replace:
#   _BACKEND=$(read_config "PERSONAL_SYNC_BACKEND" "")
# With:
_BACKEND=$(read_config "primary_backend" "")
[[ -z "$_BACKEND" ]] && _BACKEND=$(read_config "PERSONAL_SYNC_BACKEND" "")
```

- [ ] **Step 3: Commit**

```bash
git add core/hooks/session-start.sh
git commit -m "refactor: replace inline personal data pull with backup engine call

Session-start now delegates pull to backup-engine.sh --pull instead of
inline rclone/git logic. Reduces session-start by ~55 lines. Sync
health check updated to read new config keys with old-key fallback."
```

---

## Task 8: Write Guard Update

**Files:**
- Modify: `core/hooks/write-guard.sh` (minimal change — registry is still at same path)

- [ ] **Step 1: Verify write-guard still works**

The write registry file (`~/.claude/.write-registry.json`) is written by `backup-engine.sh` in the same format as `git-sync.sh` did. The path and JSON structure are unchanged, so `write-guard.sh` should work without modification.

Run: Verify by reading `write-guard.sh` lines 58-68 (registry read) and confirming the key format matches what `backup-engine.sh` writes.

- [ ] **Step 2: Add a comment noting the registry writer changed**

Update the comment at the top of `write-guard.sh` to reference `backup-engine.sh` instead of `git-sync.sh`:

```bash
# Registry file populated by backup-engine.sh (was: git-sync.sh)
```

- [ ] **Step 3: Commit**

```bash
git add core/hooks/write-guard.sh
git commit -m "docs: update write-guard registry source comment

Registry is now populated by backup-engine.sh instead of git-sync.sh.
Format and path unchanged — no functional changes needed."
```

---

## Task 9: /restore Command

**Files:**
- Create: `core/commands/restore.md`

- [ ] **Step 1: Write the restore command**

```markdown
---
name: restore
description: Restore personal data from your backup
---

# /restore — Restore Personal Data

Run the backup engine in restore mode to pull personal data from your configured backup backend. This is safe to run anytime — it will never overwrite toolkit files.

## Steps

1. Run the backup engine in restore mode:
   ```bash
   bash "$TOOLKIT_ROOT/core/hooks/backup-engine.sh" --restore
   ```
   Parse the JSON output to see what's available.

2. If status is "no_backend": tell the user no backup is configured and suggest `/setup-wizard`.

3. If status is "unreachable": tell the user the backend can't be reached and suggest checking their connection.

4. If status is "ok": present what was found:
   - Memory files: restore automatically
   - Conversation history: restore automatically
   - Keybindings: restore automatically
   - CLAUDE.md: ask the user:
     > "I found your previous personal instructions from your backup. Would you like me to:
     > 1. **Merge them** — Keep your personal notes and preferences, but update the toolkit sections to match what's installed now *(recommended)*
     > 2. **Use your backup** — Restore exactly what you had before, as-is
     > 3. **Start fresh** — Keep only the current version"
   - For merge: use the marker system. Content between `<!-- BEGIN:fragment-name -->` and `<!-- END:fragment-name -->` markers comes from the current install. Everything else comes from the backup.
   - Encyclopedia: copy files to `~/.claude/encyclopedia/`. If the backup has docs that don't match current expected types, note this and suggest running encyclopedia-update.
   - Custom skills: for each skill in the `custom_skills` array, ask:
     > "I found a custom skill called '{name}' in your backup. This isn't part of the DestinClaude toolkit. Restore it?"
   - User-choice config: merge keys from `user-choices.json` into current config.json (only keys that aren't already set).

5. After restoring, verify toolkit integrity by checking that no toolkit-owned files were overwritten:
   ```bash
   # Read plugin-manifest.json and verify all listed skills/hooks still exist
   ```

6. Clean up the temp directory from the restore output.

7. Report results to the user.
```

- [ ] **Step 2: Commit**

```bash
git add core/commands/restore.md
git commit -m "feat: add /restore command for ad-hoc personal data restoration

Exposes the backup engine's restore mode as an interactive command.
Handles CLAUDE.md merge prompt, custom skill confirmation, and
toolkit integrity verification."
```

---

## Task 10: Setup Wizard Phase 5R

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (replace Phase 0A/0B/0C with Phase 5R)

- [ ] **Step 1: Read the current Phase 0 section (lines ~16-251)**

Understand the current restore flow to ensure nothing is lost.

- [ ] **Step 2: Remove Phase 0A, 0B, 0C restore content**

Replace lines ~61-251 (Phase 0A GitHub restore, Phase 0B Drive restore, Phase 0C abbreviated dependency check) with a simplified Phase 0 that only asks if the user has used DestinClaude before and stores the answer for Phase 5R:

```markdown
### Phase 0: Prior Use Check

Ask the user: "Have you used DestinClaude before on another device?"

- **Yes:** Store `returning_user: true` in memory. Continue to Phase 1 (full install).
- **No:** Continue to Phase 1 (full install).

**Important:** Returning users go through the FULL install (Phases 1-6), not an abbreviated path. Personal data restoration happens in Phase 5R, AFTER the toolkit is fully installed and configured. This ensures the toolkit is in a known-good state before layering personal data on top.
```

- [ ] **Step 3: Add Phase 5R after Phase 5**

Insert between Phase 5 (Personalization) and Phase 6 (Verification):

```markdown
### Phase 5R: Restore Personal Data (returning users only)

**Skip this phase if the user said "No" in Phase 0.**

This phase runs AFTER Phase 5 has fully installed the toolkit. The system is in a clean, working state. Now we layer personal data on top.

#### Step 1: Ask about backup location

> "Now let's restore your personal data from your previous setup. Where is your backup stored?"
> 1. **Google Drive** (uses rclone)
> 2. **Private GitHub repo**
> 3. **iCloud** (macOS only)
> 4. **I don't have a backup** (skip)

If they choose option 4, skip to Phase 6.

Set `primary_backend` in config.json based on their choice. For GitHub, ask for the repo URL and set `primary_backend_repo`.

#### Step 2: Connect and inventory

Run the backup engine in restore mode:
```bash
bash "$TOOLKIT_ROOT/core/hooks/backup-engine.sh" --restore
```

Parse the JSON output. If status is not "ok", explain the issue clearly and offer to retry or skip.

#### Step 3: Restore data categories

For each available category:

- **Memory files**: Restore automatically, no prompt needed.
  ```bash
  # Copy from temp_dir/memory/{project}/ to ~/.claude/projects/{project}/memory/
  ```

- **Conversation history**: Restore automatically.
  ```bash
  # Copy from temp_dir/conversations/{project}/ to ~/.claude/projects/{project}/
  ```

- **Keybindings**: Restore automatically.
  ```bash
  # Copy from temp_dir/config/keybindings.json to ~/.claude/keybindings.json
  ```

- **CLAUDE.md**: Present the three-option merge prompt:
  > "I found your previous personal instructions from your backup. I also just generated fresh instructions based on your current toolkit setup. Would you like me to:
  > 1. **Merge them** — Keep your personal notes and preferences, but update the toolkit sections to match what's installed now *(recommended)*
  > 2. **Use your backup** — Restore exactly what you had before, as-is
  > 3. **Start fresh** — Keep only the new version the setup wizard just created"

  For **Merge**: Read both files. Content between `<!-- BEGIN:fragment-name -->` and `<!-- END:fragment-name -->` markers comes from the current (wizard-generated) CLAUDE.md. Everything outside markers comes from the backup CLAUDE.md. Write the merged result.

  For **Use backup**: Copy the backup CLAUDE.md over the current one.

  For **Start fresh**: Do nothing (keep the wizard-generated version).

- **Encyclopedia**: Copy to `~/.claude/encyclopedia/`. If backup has document types that don't exist in the current toolkit's expected set, note this for the user.

- **User-choice config**: Merge from `user-choices.json` — only apply keys not already set during this setup session.

- **Custom skills**: For each skill in the backup's extensions:
  > "I found a custom skill called '{name}' in your backup. This isn't part of the DestinClaude toolkit. Would you like to restore it?"
  If yes, copy the skill directory to `~/.claude/skills/{name}/` and add to `user_extensions.skills` in config.json.

- **External projects**: If the backup contains a `backup_registry`, offer to re-register:
  > "Your previous setup had these external projects backed up: {list}. Would you like to set those up again?"

#### Step 4: Verify toolkit integrity

After all restores, verify that no toolkit-owned files were overwritten by checking `plugin-manifest.json` against the installed files. If anything was overwritten, re-copy from the toolkit repo.

#### Step 5: Clean up

Remove the temp directory created by the engine's restore mode.

Report what was restored and what was skipped.
```

- [ ] **Step 4: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "refactor: replace Phase 0 restore with Phase 5R (install-first)

Returning users now go through the full install (Phases 1-5), then
restore personal data in Phase 5R. This ensures the toolkit is in a
known-good state before layering personal data. Removes the old
Phase 0A/0B/0C abbreviated restore flow that could conflict with
fresh installs (D5 in design doc)."
```

---

## Task 11: Update Release Script

**Files:**
- Modify: `scripts/release.sh` (add generate-manifest.sh call)

- [ ] **Step 1: Add manifest generation before git operations**

In `release.sh`, after the file updates (line ~55) and before `git add` (line ~57), add:

```bash
# Generate updated manifest
bash "$SCRIPT_DIR/generate-manifest.sh"
```

And add `plugin-manifest.json` to the `git add` command:

```bash
git add VERSION plugin.json CHANGELOG.md plugin-manifest.json
```

- [ ] **Step 2: Commit**

```bash
git add scripts/release.sh
git commit -m "feat: add manifest generation to release process

release.sh now calls generate-manifest.sh before committing, ensuring
plugin-manifest.json is always in sync with the actual toolkit contents
at release time."
```

---

## Task 12: Delete Old Scripts and Update Hook Registration

**Files:**
- Delete: `core/hooks/git-sync.sh`
- Delete: `core/hooks/personal-sync.sh`
- Modify: `core/skills/setup-wizard/SKILL.md` (hook registration in Phase 5)

- [ ] **Step 1: Delete old scripts**

```bash
git rm core/hooks/git-sync.sh
git rm core/hooks/personal-sync.sh
```

- [ ] **Step 2: Update hook registration in setup wizard**

In Phase 5 Step 5 of `SKILL.md`, update the hook registration to:
- Register `backup-engine.sh` as the PostToolUse hook (replacing both git-sync and personal-sync)
- Remove git-sync.sh and personal-sync.sh from the symlink/copy list
- Add `backup-engine.sh` and `backends/` directory to the install list

The `settings.json` hook entry should change from two PostToolUse hooks to one:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "bash ~/.claude/hooks/backup-engine.sh" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Update the symlink/copy list**

Add to the install list in Phase 5:
- `core/hooks/backup-engine.sh` → `~/.claude/hooks/backup-engine.sh`
- `core/hooks/backends/` → `~/.claude/hooks/backends/` (entire directory)

Remove from the install list:
- `core/hooks/git-sync.sh`
- `core/hooks/personal-sync.sh`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: delete old backup scripts, update hook registration

Removes git-sync.sh and personal-sync.sh. Updates setup wizard to
register backup-engine.sh as the single PostToolUse hook. Installs
backend drivers directory alongside engine."
```

---

## Task 13: Update Specs

**Files:**
- Modify: `core/specs/backup-system-spec.md`
- Modify: `core/specs/personal-sync-spec.md`
- Modify: `core/specs/destinclaude-spec.md`

- [ ] **Step 1: Rewrite backup-system-spec.md**

Major version bump (3.3 → 4.0). Rewrite to reflect the new architecture:
- Update Purpose to describe the single backup engine
- Update User Mandates (preserve all existing mandates, add manifest-based classification)
- Update Design Decisions (reference design doc decisions D1-D12)
- Update Current Implementation to describe backup-engine.sh, backend drivers, plugin manifest, canonical schema
- Update Tracked Files to reflect new scope (personal data only, not toolkit files)
- Update Dependencies
- Update the Change Log

- [ ] **Step 2: Update personal-sync-spec.md**

Add deprecation notice at the top:

```markdown
> **DEPRECATED:** This spec has been superseded by the Backup & Sync spec v4.0.
> The personal-sync.sh hook has been replaced by backup-engine.sh.
> See `backup-system-spec.md` for the current architecture.
```

- [ ] **Step 3: Update destinclaude-spec.md**

Update the Layers and Components table (line ~89-94):
- Replace `git-sync, personal-sync` with `backup-engine` in Core hooks
- Add `backends/` to Core hooks
- Add `restore` to Core commands

Update the install flow diagram to reflect Phase 5R.

- [ ] **Step 4: Commit**

```bash
git add core/specs/
git commit -m "docs: update specs for backup system refactor

backup-system-spec bumped to v4.0 with new architecture.
personal-sync-spec deprecated (superseded by backup-system-spec v4.0).
destinclaude-spec updated with new hook and command listings."
```

---

## Task 14: End-to-End Verification

- [ ] **Step 1: Verify manifest generation**

Run: `bash scripts/generate-manifest.sh && cat plugin-manifest.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const m=JSON.parse(d);console.log('Skills:',m.owned_files.skills.length,'Hooks:',m.owned_files.hooks.length,'Commands:',m.owned_files.commands.length)})"`

Expected: Non-zero counts for skills, hooks, commands.

- [ ] **Step 2: Verify backup engine push mode (dry run)**

Run: `echo '{"tool_input":{"file_path":"'$HOME'/.claude/CLAUDE.md"}}' | bash core/hooks/backup-engine.sh`

Expected: Exit 0. Check `backup.log` for an entry.

- [ ] **Step 3: Verify backup engine pull mode**

Run: `bash core/hooks/backup-engine.sh --pull`

Expected: Exit 0. Check `backup.log` for pull log entry.

- [ ] **Step 4: Verify toolkit integrity check**

Temporarily rename VERSION file, run session-start, verify recovery:
```bash
mv VERSION VERSION.bak
# Run integrity check portion manually
# Should attempt recovery
mv VERSION.bak VERSION
```

- [ ] **Step 5: Verify file classification**

Test classification of different file types:
```bash
# Should return "personal"
echo '{"tool_input":{"file_path":"'$HOME'/.claude/projects/test/memory/test.md"}}' | bash core/hooks/backup-engine.sh

# Should exit silently (toolkit-owned)
echo '{"tool_input":{"file_path":"'$HOME'/.claude/hooks/session-start.sh"}}' | bash core/hooks/backup-engine.sh

# Should exit silently (excluded)
echo '{"tool_input":{"file_path":"'$HOME'/.claude/settings.json"}}' | bash core/hooks/backup-engine.sh
```

- [ ] **Step 6: Verify no old script references remain**

Run: `grep -r "git-sync\|personal-sync\|drive-archive" core/ --include="*.sh" --include="*.md" -l`

Expected: Only spec files (with deprecation/changelog references) and design docs. No active code references.

- [ ] **Step 7: Final commit — remove any leftover state files from old system**

```bash
# Clean up old push markers if naming changed
# Old: .push-marker, .push-marker-destincode
# New: .push-marker-drive, .push-marker-github, etc.
# Old markers are harmless but can be cleaned up
```

- [ ] **Step 8: Commit verification results**

```bash
git add -A
git commit -m "chore: end-to-end verification of backup system refactor

All verification steps pass: manifest generation, push/pull modes,
toolkit integrity check, file classification, no stale references."
```
