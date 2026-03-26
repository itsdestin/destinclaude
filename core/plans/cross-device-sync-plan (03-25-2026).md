# Cross-Device Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable cross-device conversation sync and unified `/resume` from the home directory, plus portable/local config split to eliminate cross-device config conflicts.

**Architecture:** Personal-sync pushes/pulls conversations per-slug alongside existing memory/encyclopedia/skills. Session-start aggregates all conversations into the home-directory slug via symlinks. Config split separates machine-specific values into a locally-rebuilt `config.local.json`.

**Tech Stack:** Bash (hooks), Node.js (JSON manipulation), rclone (Drive backend), git (GitHub backend), rsync/cp (iCloud backend)

**Design doc:** `core/plans/cross-device-sync-design (03-25-2026).md`

**Note on line numbers:** All line references are relative to the **pre-modification** source files. After earlier tasks modify a file, subsequent line numbers for that same file will be shifted. Locate insertion points by **surrounding context** (function names, comments, nearby code) rather than relying on absolute line numbers after earlier tasks have been applied.

**Deferred:** Setup wizard Phase 5 git repo initialization is not included in this plan — it's a UX/wizard change that should be implemented separately after the core sync infrastructure is in place.

---

### Task 1: Config split — `config_get()` dual-file support

**Files:**
- Modify: `core/hooks/lib/backup-common.sh:14` (add constant), `core/hooks/lib/backup-common.sh:27-51` (rewrite `config_get`)

- [ ] **Step 1: Add `LOCAL_CONFIG_FILE` constant**

In `backup-common.sh`, after line 14 (`CONFIG_FILE=...`), add:

```bash
LOCAL_CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.local.json"
```

- [ ] **Step 2: Rewrite `config_get()` for dual-file reads**

Replace the existing `config_get()` function (lines 27-51) with:

```bash
# --- Config reading ---
# Read a key from config.local.json (machine-specific, takes precedence),
# then config.json (portable). Falls back to grep if node unavailable.
# Design ref: cross-device-sync-design (03-25-2026) D1
config_get() {
    local key="$1" default="${2:-}"
    local val=""
    # Check local config first (machine-specific, takes precedence)
    if [[ -f "$LOCAL_CONFIG_FILE" ]] && command -v node &>/dev/null; then
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$LOCAL_CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Then check portable config
    if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
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
    # Grep fallback (portable config only — local is always valid JSON from node)
    if [[ -f "$CONFIG_FILE" ]]; then
        val=$(sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$CONFIG_FILE" 2>/dev/null | head -1)
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    echo "$default"
}
```

- [ ] **Step 3: Verify locally**

```bash
source ~/.claude/plugins/destinclaude/core/hooks/lib/backup-common.sh
config_get "PERSONAL_SYNC_BACKEND" "none"
# Expected: "drive" (reads from config.json since config.local.json doesn't exist yet)
```

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/lib/backup-common.sh
git commit -m "feat(backup): config_get reads config.local.json with local-first precedence (D1)"
```

---

### Task 2: Config split — `rebuild_local_config()` in session-start

**Files:**
- Modify: `core/hooks/session-start.sh:44` (insert after config auto-create block)

- [ ] **Step 1: Add `rebuild_local_config()` function**

Insert after line 44 (the `fi` closing the auto-create config.json block) in `session-start.sh`:

```bash
# --- Rebuild machine-specific config (Design ref: cross-device-sync D1) ---
# Detects platform, toolkit root, and binary availability.
# Writes config.local.json — never synced, rebuilt every session start.
rebuild_local_config() {
    local local_config="$CLAUDE_DIR/toolkit-state/config.local.json"

    # Detect platform
    local platform="linux"
    case "$(uname -s)" in
        MINGW*|MSYS*) platform="windows" ;;
        Darwin) platform="macos" ;;
        Linux)
            if [[ -d "/data/data/com.termux" || -d "/data/data/com.destin.code" ]]; then
                platform="android"
            fi
            ;;
    esac

    # toolkit_root already resolved above
    local tk_root="${TOOLKIT_ROOT:-}"

    # Detect gmessages binary
    local gmessages_bin=""
    if command -v gmessages &>/dev/null; then
        gmessages_bin=$(command -v gmessages)
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe"
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages"
    fi

    # Detect gcloud
    local gcloud_installed=false
    command -v gcloud &>/dev/null && gcloud_installed=true

    # Write config.local.json
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    if command -v node &>/dev/null; then
        node -e "
            const fs = require('fs');
            const data = {
                platform: process.argv[1],
                toolkit_root: process.argv[2] || null,
                gmessages_binary: process.argv[3] || null,
                gcloud_installed: process.argv[4] === 'true'
            };
            fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
        " "$platform" "$tk_root" "$gmessages_bin" "$gcloud_installed" "$local_config" 2>/dev/null
    else
        cat > "$local_config" << LOCALEOF
{
  "platform": "$platform",
  "toolkit_root": ${tk_root:+\"$tk_root\"}${tk_root:-null},
  "gmessages_binary": ${gmessages_bin:+\"$gmessages_bin\"}${gmessages_bin:-null},
  "gcloud_installed": $gcloud_installed
}
LOCALEOF
    fi
}
rebuild_local_config
```

- [ ] **Step 2: Add one-time migration to strip machine-specific keys from config.json**

Insert immediately after `rebuild_local_config`:

```bash
# --- One-time migration: strip machine-specific keys from config.json ---
# If config.json still has machine-specific keys, remove them so only portable
# data remains. config.local.json now owns these. Also push cleaned config
# to preferred backend so next pull doesn't re-introduce stale values.
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _CLEANED=$(node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
            const c = JSON.parse(fs.readFileSync(path, 'utf8'));
            const localKeys = ['platform', 'toolkit_root', 'gmessages_binary', 'gcloud_installed'];
            let changed = false;
            for (const k of localKeys) {
                if (k in c) { delete c[k]; changed = true; }
            }
            if (changed) {
                fs.writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
                console.log('cleaned');
            }
        } catch {}
    " "$CONFIG_FILE" 2>/dev/null) || true
    # If we cleaned, push to preferred backend so next pull doesn't re-introduce stale keys
    if [[ "$_CLEANED" == "cleaned" ]]; then
        _MIG_BACKEND=""
        type get_preferred_backend &>/dev/null && _MIG_BACKEND=$(get_preferred_backend)
        case "$_MIG_BACKEND" in
            drive)
                if command -v rclone &>/dev/null; then
                    _DR=$(config_get "DRIVE_ROOT" "Claude")
                    rclone copyto "$CONFIG_FILE" "gdrive:$_DR/Backup/personal/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
            github)
                _MIG_REPO="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
                if [[ -d "$_MIG_REPO/.git" ]]; then
                    mkdir -p "$_MIG_REPO/toolkit-state"
                    cp "$CONFIG_FILE" "$_MIG_REPO/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
            icloud)
                _MIG_ICLOUD=$(config_get "ICLOUD_PATH" "")
                if [[ -n "$_MIG_ICLOUD" && -d "$_MIG_ICLOUD" ]]; then
                    mkdir -p "$_MIG_ICLOUD/toolkit-state"
                    cp "$CONFIG_FILE" "$_MIG_ICLOUD/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
        esac
    fi
fi
```

- [ ] **Step 3: Stop git-committing mcp-config.json**

Find the MCP config extraction block (around line 53-80). Replace the git add/commit lines:

```bash
            # Stage and commit so git-pull doesn't conflict
            cd "$CLAUDE_DIR"
            git add "$MCP_CONFIG" 2>/dev/null && \
                git commit -m "auto: mcp-config.json" --no-gpg-sign 2>/dev/null || true
```

With:

```bash
            # Note: mcp-config.json is machine-specific (contains absolute paths,
            # platform-specific servers). NOT git-committed. See cross-device-sync design D2.
```

- [ ] **Step 4: Verify locally**

```bash
bash ~/.claude/hooks/session-start.sh 2>&1 | head -5
cat ~/.claude/toolkit-state/config.local.json
# Expected: JSON with platform: "windows", toolkit_root: "/c/Users/<username>/.claude/plugins/destinclaude"

# Verify migration stripped machine-specific keys
node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('platform' in c, 'toolkit_root' in c)" ~/.claude/toolkit-state/config.json
# Expected: false false
```

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(session-start): rebuild config.local.json per-session, stop committing mcp-config (D1, D2)"
```

---

### Task 3: Config split — personal-sync exclusions

**Files:**
- Modify: `core/hooks/personal-sync.sh:30-41` (path filter)

- [ ] **Step 1: Add early exits for machine-specific files**

In `personal-sync.sh`, inside the `case "$FILE_PATH" in` block (line 30), add before the first existing pattern:

```bash
    */toolkit-state/config.local.json) exit 0 ;;   # Machine-specific, never sync (D1)
    */mcp-servers/mcp-config.json) exit 0 ;;        # Machine-specific, never sync (D2)
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/personal-sync.sh
git commit -m "feat(personal-sync): exclude config.local.json and mcp-config.json from sync (D1, D2)"
```

---

### Task 4: Rename `get_primary_backend()` → `get_preferred_backend()`

**Files:**
- Modify: `core/hooks/lib/backup-common.sh:201-203`
- Modify: `core/hooks/session-start.sh:174-175`

- [ ] **Step 1: Rename in backup-common.sh**

Replace `get_primary_backend` with `get_preferred_backend` at line 201:

```bash
get_preferred_backend() {
    get_backends | head -1
}
```

- [ ] **Step 2: Rename caller in session-start.sh**

Replace `get_primary_backend` with `get_preferred_backend` at lines 174-175:

```bash
if type get_preferred_backend &>/dev/null; then
    _PULL_BACKEND=$(get_preferred_backend)
fi
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/lib/backup-common.sh core/hooks/session-start.sh
git commit -m "refactor: rename get_primary_backend to get_preferred_backend (D7)"
```

---

### Task 5: Config split — statusline and post-update dual-file reads

**Files:**
- Modify: `core/hooks/statusline.sh:128-129`
- Modify: `scripts/post-update.sh:134`

- [ ] **Step 1: Update statusline.sh**

Replace lines 127-131 in `statusline.sh`:

```bash
HOOKS_DIR=""
if command -v node &>/dev/null && [[ -f "$HOME/.claude/toolkit-state/config.json" ]]; then
    _TK=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$HOME/.claude/toolkit-state/config.json" 2>/dev/null)
    [[ -n "$_TK" && -d "$_TK/core/hooks" ]] && HOOKS_DIR="$_TK/core/hooks"
fi
```

With:

```bash
# Check config.local.json first (machine-specific), then config.json (portable) — Design ref: D1
HOOKS_DIR=""
_TK=""
if command -v node &>/dev/null; then
    for _cfg in "$HOME/.claude/toolkit-state/config.local.json" "$HOME/.claude/toolkit-state/config.json"; do
        [[ ! -f "$_cfg" ]] && continue
        _TK=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$_cfg" 2>/dev/null)
        [[ -n "$_TK" ]] && break
    done
fi
[[ -n "$_TK" && -d "$_TK/core/hooks" ]] && HOOKS_DIR="$_TK/core/hooks"
```

- [ ] **Step 2: Update post-update.sh**

Replace line 134 in `post-update.sh`:

```bash
  TOOLKIT_ROOT="$(json_read "$CONFIG_FILE" "toolkit_root")"
```

With:

```bash
  LOCAL_CONFIG_FILE="$CLAUDE_HOME/toolkit-state/config.local.json"
  TOOLKIT_ROOT=""
  if [ -f "$LOCAL_CONFIG_FILE" ]; then
      TOOLKIT_ROOT="$(json_read "$LOCAL_CONFIG_FILE" "toolkit_root" 2>/dev/null)" || true
  fi
  if [ -z "$TOOLKIT_ROOT" ]; then
      TOOLKIT_ROOT="$(json_read "$CONFIG_FILE" "toolkit_root")"
  fi
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/statusline.sh scripts/post-update.sh
git commit -m "feat: statusline and post-update read toolkit_root from config.local.json first (D1)"
```

---

### Task 6: git-sync health check

**Files:**
- Modify: `core/hooks/git-sync.sh:46` (after `cd "$REPO_DIR"`)

- [ ] **Step 1: Add early bail if no git repo**

After line 46 (`cd "$REPO_DIR"`) in `git-sync.sh`, add:

```bash
# Bail if this directory is not a git repo (Design ref: D8)
if [[ ! -d "$REPO_DIR/.git" ]]; then
    if type log_backup &>/dev/null; then
        log_backup "WARN" "git-sync: $REPO_DIR is not a git repo — skipping"
    fi
    exit 0
fi
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/git-sync.sh
git commit -m "fix(git-sync): bail early with warning if repo dir has no .git (D8)"
```

---

### Task 6b: .gitignore updates for machine-specific files

**Files:**
- Modify: `~/.claude/.gitignore` (if the git repo exists; otherwise note for future setup wizard)

This task ensures that if/when `~/.claude` is a git repo, machine-specific files won't be committed by `git-sync.sh`.

- [ ] **Step 1: Add entries to .gitignore (if git repo exists)**

If `~/.claude/.git` exists, add to `~/.claude/.gitignore`:

```
# Machine-specific (rebuilt per-device, never synced)
toolkit-state/config.local.json
mcp-servers/mcp-config.json
```

If `~/.claude/.git` does NOT exist (current state on this machine), skip this step — the `.gitignore` entries will be part of the future setup wizard git init task.

- [ ] **Step 2: If .gitignore was modified, remove mcp-config.json from git tracking**

```bash
cd ~/.claude
git rm --cached mcp-servers/mcp-config.json 2>/dev/null || true
git add .gitignore
git commit -m "chore: gitignore config.local.json and mcp-config.json (machine-specific)" --no-gpg-sign 2>/dev/null || true
```

- [ ] **Step 3: Commit the toolkit note (no code change needed)**

No toolkit repo change for this task — the `.gitignore` lives in the user's `~/.claude` repo, not the destinclaude toolkit repo.

---

### Task 7: Conversation push — personal-sync

**Files:**
- Modify: `core/hooks/personal-sync.sh:30-41` (path filter), `core/hooks/personal-sync.sh:89-153` (`sync_drive`), `core/hooks/personal-sync.sh:155-231` (`sync_github`), `core/hooks/personal-sync.sh:233-305` (`sync_icloud`)

- [ ] **Step 1: Add `.jsonl` to path filter**

In the `case "$FILE_PATH" in` block, add after the mcp-config early exit:

```bash
    */projects/*/*.jsonl) ;;                        # Conversation transcripts (D3)
```

- [ ] **Step 2: Add conversation push to `sync_drive()`**

After the skills sync block in `sync_drive()` (around line 144, before the error check), add:

```bash
    # Conversations — push per-slug (Design ref: D3, D4)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            # Skip symlinked slug directories (foreign device slugs)
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            # Check if this slug has any .jsonl files
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                rclone copy "$slug_dir" "$REMOTE_BASE/conversations/$slug_name/" \
                    --checksum --include '*.jsonl' 2>/dev/null || {
                    log_backup "WARN" "Failed to sync conversations for $slug_name"
                    ERRORS=$((ERRORS + 1))
                }
            fi
        done
    fi
```

- [ ] **Step 3: Add conversation push to `sync_github()`**

After the skills copy block in `sync_github()` (around line 218, before `git add -A`), add:

```bash
    # Conversations — copy per-slug (Design ref: D3, D4)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                mkdir -p "$REPO_DIR/conversations/$slug_name"
                cp "$slug_dir"*.jsonl "$REPO_DIR/conversations/$slug_name/" 2>/dev/null || true
            fi
        done
    fi
```

- [ ] **Step 4: Add conversation push to `sync_icloud()`**

After the skills copy block in `sync_icloud()` (around line 301, before the final log), add:

```bash
    # Conversations — copy per-slug (Design ref: D3, D4)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                mkdir -p "$ICLOUD_PATH/conversations/$slug_name"
                rsync -a --update "$slug_dir"*.jsonl "$ICLOUD_PATH/conversations/$slug_name/" 2>/dev/null || \
                    cp "$slug_dir"*.jsonl "$ICLOUD_PATH/conversations/$slug_name/" 2>/dev/null || true
            fi
        done
    fi
```

- [ ] **Step 5: Verify the path filter works**

```bash
echo '{"tool_input":{"file_path":"/c/Users/<username>/.claude/projects/C--Users-<username>/<session-uuid>.jsonl"}}' | bash ~/.claude/hooks/personal-sync.sh 2>&1
# Expected: sync attempts (or debounce skip) — NOT immediate exit
echo '{"tool_input":{"file_path":"/c/Users/<username>/.claude/toolkit-state/config.local.json"}}' | bash ~/.claude/hooks/personal-sync.sh 2>&1
# Expected: immediate exit (no output)
```

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/personal-sync.sh
git commit -m "feat(personal-sync): push conversations per-slug to all backends (D3, D4)"
```

---

### Task 8: Conversation pull — session-start

**Files:**
- Modify: `core/hooks/session-start.sh` (after existing personal data pull block, around line 230)

- [ ] **Step 1: Add conversation pull to Drive backend**

Inside the `drive)` case block in session-start.sh, after the encyclopedia pull (around line 197), add:

```bash
                # Conversations — pull per-slug (Design ref: D3)
                log_backup "INFO" "Pulling conversations from Drive..."
                rclone copy "$DRIVE_SOURCE/conversations/" "$CLAUDE_DIR/projects/" \
                    --checksum --include '*.jsonl' 2>/dev/null || \
                    log_backup "WARN" "Drive pull (conversations) failed"
```

- [ ] **Step 2: Add conversation pull to GitHub backend**

Inside the `github)` case block, after the encyclopedia pull (around line 209), add:

```bash
                # Conversations
                if [[ -d "$REPO_DIR/conversations" ]]; then
                    for _conv_slug in "$REPO_DIR/conversations"/*/; do
                        [[ ! -d "$_conv_slug" ]] && continue
                        _cs_name=$(basename "$_conv_slug")
                        mkdir -p "$CLAUDE_DIR/projects/$_cs_name"
                        cp -n "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || true
                    done
                fi
```

Note: no `local` keyword — this code runs in a `case` block, not a function.

- [ ] **Step 3: Add conversation pull to iCloud backend**

Inside the `icloud)` case block, after the encyclopedia pull (around line 226), add:

```bash
                # Conversations
                if [[ -d "$ICLOUD_PATH/conversations" ]]; then
                    for _conv_slug in "$ICLOUD_PATH/conversations"/*/; do
                        [[ ! -d "$_conv_slug" ]] && continue
                        _cs_name=$(basename "$_conv_slug")
                        mkdir -p "$CLAUDE_DIR/projects/$_cs_name"
                        rsync -a --update "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || \
                            cp -n "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || true
                    done
                fi
```

Note: no `local` keyword — this code runs in a `case` block, not a function.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(session-start): pull conversations per-slug from all backends (D3)"
```

---

### Task 9: Home-directory conversation aggregation

**Files:**
- Modify: `core/hooks/lib/backup-common.sh` (add `aggregate_conversations()` after `rewrite_project_slugs`)
- Modify: `core/hooks/session-start.sh` (call it after slug rewriting)

- [ ] **Step 1: Add `aggregate_conversations()` to backup-common.sh**

After the `rewrite_project_slugs()` function (after line 188), add:

```bash
# --- Home-directory conversation aggregation (Design ref: D5, D6) ---
# Symlinks all .jsonl conversation files from all project slugs into the
# home-directory slug so /resume from ~ shows all conversations.
# Arguments: $1 = projects directory (e.g., ~/.claude/projects)
aggregate_conversations() {
    local projects_dir
    projects_dir=$(cd "$1" && pwd) || return 0
    [[ ! -d "$projects_dir" ]] && return 0

    local home_slug
    home_slug=$(get_current_project_slug)
    [[ -z "$home_slug" ]] && return 0

    local home_dir="$projects_dir/$home_slug"
    mkdir -p "$home_dir"

    # Windows symlink support
    [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && export MSYS=winsymlinks:nativestrict

    local aggregated=0

    for slug_dir in "$projects_dir"/*/; do
        [[ ! -d "$slug_dir" ]] && continue
        local slug_name
        slug_name=$(basename "$slug_dir")

        # Skip the home slug itself
        [[ "$slug_name" == "$home_slug" ]] && continue

        # Skip symlinked slug directories (foreign device slugs from rewrite_project_slugs)
        [[ -L "${slug_dir%/}" ]] && continue

        # Symlink each .jsonl file into the home slug
        for jsonl_file in "$slug_dir"*.jsonl; do
            [[ ! -f "$jsonl_file" ]] && continue
            local basename_jsonl
            basename_jsonl=$(basename "$jsonl_file")
            local target="$home_dir/$basename_jsonl"

            # Skip if already exists (real file = local conversation, symlink = already aggregated)
            [[ -e "$target" || -L "$target" ]] && continue

            # Create relative symlink
            ln -s "../$slug_name/$basename_jsonl" "$target" 2>/dev/null || \
                cp "$jsonl_file" "$target" 2>/dev/null || true
            aggregated=$((aggregated + 1))
        done
    done

    # Clean up dangling symlinks in home slug
    for link in "$home_dir"/*.jsonl; do
        [[ ! -L "$link" ]] && continue
        if [[ ! -e "$link" ]]; then
            rm -f "$link" 2>/dev/null
        fi
    done

    if [[ $aggregated -gt 0 ]]; then
        log_backup "INFO" "Aggregated $aggregated conversation(s) into home slug: $home_slug"
    fi
}
```

- [ ] **Step 2: Call `aggregate_conversations()` in session-start.sh**

After the `rewrite_project_slugs` call (around line 237-238), add:

```bash
# --- Home-directory conversation aggregation (Design ref: D5) ---
if type aggregate_conversations &>/dev/null; then
    aggregate_conversations "$CLAUDE_DIR/projects"
fi
```

- [ ] **Step 3: Verify locally**

```bash
# Run session-start and check for symlinks in home slug
bash ~/.claude/hooks/session-start.sh 2>&1 | grep -i "aggregat" || echo "No aggregation output (may be zero new conversations)"
ls -la ~/.claude/projects/C--Users-<username>/*.jsonl | head -20
# Expected: mix of real files and symlinks pointing to other slug dirs
```

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/lib/backup-common.sh core/hooks/session-start.sh
git commit -m "feat: aggregate conversations from all slugs into home slug for unified /resume (D5, D6)"
```

---

### Task 10: Legacy conversation migration

**Files:**
- Modify: `core/hooks/session-start.sh` (add migration block after conversation pull, before aggregation)

- [ ] **Step 1: Add legacy migration block**

Insert after the conversation pull blocks but before the slug rewriting/aggregation calls:

```bash
# --- Legacy conversation migration (Design ref: D9) ---
# One-time: copy conversations from old gdrive:Claude/Backup/conversations/
# to new gdrive:Claude/Backup/personal/conversations/
_LEGACY_MARKER="$CLAUDE_DIR/toolkit-state/.legacy-conversations-migrated"
if [[ ! -f "$_LEGACY_MARKER" ]] && command -v rclone &>/dev/null; then
    DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")
    _LEGACY_PATH="gdrive:$DRIVE_ROOT/Backup/conversations/"
    # Check if legacy path exists
    if rclone lsd "$_LEGACY_PATH" &>/dev/null; then
        log_backup "INFO" "Migrating legacy conversations from $_LEGACY_PATH..."
        rclone copy "$_LEGACY_PATH" "gdrive:$DRIVE_ROOT/Backup/personal/conversations/" \
            --checksum 2>/dev/null && {
            date +%s > "$_LEGACY_MARKER"
            log_backup "INFO" "Legacy conversation migration complete"
        } || log_backup "WARN" "Legacy conversation migration failed (will retry next session)"
    else
        # No legacy path — mark as done
        date +%s > "$_LEGACY_MARKER"
    fi
fi
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(session-start): one-time legacy conversation migration from old Drive path (D9)"
```

---

### Task 11: Git repo health warning in session-start

**Files:**
- Modify: `core/hooks/session-start.sh` (sync health check section, around line 265-308)

- [ ] **Step 1: Add GIT:NOT_INITIALIZED warning**

After the personal data sync status check (around line 308, before the skills check), add:

```bash
# 1b. Git repo health (Design ref: D8)
_GIT_REMOTE=""
if type config_get &>/dev/null; then
    _GIT_REMOTE=$(config_get "GIT_REMOTE" "")
fi
if [[ -n "$_GIT_REMOTE" && "$_GIT_REMOTE" != "none" && ! -d "$CLAUDE_DIR/.git" ]]; then
    echo "GIT:NOT_INITIALIZED" >> "$WARNINGS_FILE"
fi
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(session-start): warn if GIT_REMOTE configured but ~/.claude not a git repo (D8)"
```

---

### Task 12: Spec updates

**Files:**
- Modify: `core/specs/backup-system-spec.md`
- Modify: `core/specs/personal-sync-spec.md`

- [ ] **Step 1: Update backup-system-spec.md**

Version bump: `4.2` → `4.3`

In the Purpose section, replace "Git + GitHub repository as the primary sync mechanism" with "Git + GitHub repository as one of several complementary sync mechanisms". Remove "Git is the primary sync mechanism; Drive/iCloud are secondary safety nets" from the Personal-sync design decision rationale.

Add three new rows to the Design Decisions table:
- D1: Portable/local config split (from design doc)
- D2: mcp-config.json excluded from sync (note as reversal of v4.2)
- D8: Git repo health check, not requirement

Update MCP servers tracked files row: "excludes `mcp-config.json` — machine-specific, gitignored since v4.3"

Add to State Files table: `~/.claude/toolkit-state/config.local.json` | Machine-specific config (platform, toolkit_root, binary paths). Rebuilt every session start. Never synced. | session-start (`rebuild_local_config`)

Add changelog entry for v4.3.

- [ ] **Step 2: Update personal-sync-spec.md**

Version bump: `2.1` → `2.2`

Add to "What Gets Synced" table: `Conversations | ~/.claude/projects/*/*.jsonl | Session transcripts, cross-device /resume`

In "What does NOT get synced", change "Sessions, shell-snapshots, tasks (ephemeral runtime state)" to "Shell-snapshots, tasks (ephemeral runtime state)". Add bullets for `config.local.json` and `mcp-config.json`.

Add new design decisions:
- Conversations synced per-slug with home-directory aggregation
- Machine-specific files excluded (config.local.json, mcp-config.json)
- Legacy conversation migration (D9)

Add `conversations/{slug}/` to all backend directory structure diagrams.

Document `aggregate_conversations()` in Session-Start Integration section.

Document `--checksum` rationale for conversations vs `--update` for other categories.

Add changelog entry for v2.2.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/backup-system-spec.md core/specs/personal-sync-spec.md
git commit -m "docs(specs): backup-system v4.3, personal-sync v2.2 — conversation sync, config split, backend equality"
```

---

### Task 13: End-to-end verification

- [ ] **Step 1: Verify config.local.json generation**

```bash
bash ~/.claude/hooks/session-start.sh 2>&1 | head -10
cat ~/.claude/toolkit-state/config.local.json
# Expected: platform "windows", valid toolkit_root
```

- [ ] **Step 2: Verify config.json has no machine-specific keys**

```bash
node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('platform' in c, 'toolkit_root' in c)" ~/.claude/toolkit-state/config.json
# Expected: false false
```

- [ ] **Step 3: Verify config_get reads from config.local.json**

```bash
source ~/.claude/plugins/destinclaude/core/hooks/lib/backup-common.sh && config_get toolkit_root
# Expected: /c/Users/<username>/.claude/plugins/destinclaude
```

- [ ] **Step 4: Verify personal-sync excludes config.local.json**

```bash
echo '{"tool_input":{"file_path":"/c/Users/<username>/.claude/toolkit-state/config.local.json"}}' | bash ~/.claude/hooks/personal-sync.sh 2>&1
# Expected: immediate exit (no output)
```

- [ ] **Step 5: Verify conversations are pushed to Drive**

```bash
# Trigger a manual personal-sync (reset debounce first)
rm -f ~/.claude/toolkit-state/.personal-sync-marker
echo '{"tool_input":{"file_path":"/c/Users/<username>/.claude/projects/C--Users-<username>/<session-uuid>.jsonl"}}' | bash ~/.claude/hooks/personal-sync.sh 2>&1
# Check Drive
rclone ls "gdrive:Claude/Backup/personal/conversations/C--Users-<username>/" 2>/dev/null | head -5
# Expected: .jsonl files listed
```

- [ ] **Step 6: Verify conversation aggregation**

```bash
ls -la ~/.claude/projects/C--Users-<username>/*.jsonl 2>/dev/null | grep "^l"
# Expected: symlinks for any conversations from other project slugs
```

- [ ] **Step 7: Verify git-sync bails gracefully without git repo**

```bash
echo '{"tool_input":{"file_path":"/c/Users/<username>/.claude/CLAUDE.md"}}' | bash ~/.claude/hooks/git-sync.sh 2>&1
tail -3 ~/.claude/backup.log
# Expected: WARN log entry about not being a git repo
```
