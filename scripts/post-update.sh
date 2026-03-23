#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# post-update.sh — Post-merge hook dispatcher for destinclaude toolkit
#
# Runs after git merge (via .git/hooks/post-merge) to perform tasks that the
# /update skill cannot handle because the skill is loaded before the merge.
# This script is read at execution time (new version) so it knows about newly
# added hooks and phases.
# =============================================================================

# --- Constants ----------------------------------------------------------------

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CONFIG_FILE="$CLAUDE_HOME/toolkit-state/config.json"

# Resolve SCRIPT_DIR to the absolute directory containing this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Trap handler -------------------------------------------------------------

_trap_handler() {
  local exit_code=$?
  local line_no="${1:-}"
  emit "FAIL" "script" "unexpected error: exit ${exit_code} at line ${line_no}"
  exit 2
}
trap '_trap_handler $LINENO' ERR

# =============================================================================
# Platform detection
# =============================================================================

PLATFORM=""

detect_platform() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null || true)"

  case "$uname_out" in
    Darwin*)
      PLATFORM="macos"
      ;;
    Linux*)
      PLATFORM="linux"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      PLATFORM="windows"
      export MSYS=winsymlinks:nativestrict
      ;;
    *)
      # Fallback: check OSTYPE
      case "${OSTYPE:-}" in
        darwin*)  PLATFORM="macos"   ;;
        linux*)   PLATFORM="linux"   ;;
        msys*|cygwin*|win*) PLATFORM="windows"; export MSYS=winsymlinks:nativestrict ;;
        *)        PLATFORM="unknown" ;;
      esac
      ;;
  esac
}

# =============================================================================
# Path helpers
# =============================================================================

# to_node_path PATH
# On Windows/MSYS, converts /c/Users/... style paths to C:/Users/... so Node.js
# (which does not understand MSYS drive paths) can open them.  On other platforms
# the path is returned unchanged.
to_node_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  else
    printf '%s' "$p"
  fi
}

# =============================================================================
# JSON helpers
# =============================================================================

# json_read FILE KEY
# Reads a single string value from a JSON file using node.
json_read() {
  local file="$1"
  local key="$2"
  local node_file
  node_file="$(to_node_path "$file")"
  node -e "
    try {
      var d = require('fs').readFileSync('${node_file}', 'utf8');
      var obj = JSON.parse(d);
      var val = obj['${key}'];
      if (val === undefined || val === null) { process.stderr.write('key not found: ${key}\n'); process.exit(1); }
      process.stdout.write(String(val));
    } catch(e) { process.stderr.write(e.message + '\n'); process.exit(1); }
  "
}

# json_read_array FILE KEY
# Reads a JSON array from a JSON file and prints each element on its own line.
json_read_array() {
  local file="$1"
  local key="$2"
  local node_file
  node_file="$(to_node_path "$file")"
  node -e "
    try {
      var d = require('fs').readFileSync('${node_file}', 'utf8');
      var obj = JSON.parse(d);
      var arr = obj['${key}'];
      if (!Array.isArray(arr)) { process.stderr.write('key is not an array: ${key}\n'); process.exit(1); }
      arr.forEach(function(item) { process.stdout.write(String(item) + '\n'); });
    } catch(e) { process.stderr.write(e.message + '\n'); process.exit(1); }
  "
}

# =============================================================================
# Config loading
# =============================================================================

TOOLKIT_ROOT=""
INSTALLED_LAYERS=()

load_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    emit "FAIL" "config" "config file not found: $CONFIG_FILE"
    exit 1
  fi

  TOOLKIT_ROOT="$(json_read "$CONFIG_FILE" "toolkit_root")"

  # Read installed_layers array into a bash indexed array.
  # Uses a while-read loop for bash 3.2 compatibility (no mapfile/readarray).
  INSTALLED_LAYERS=()
  while IFS= read -r line; do
    [ -n "$line" ] && INSTALLED_LAYERS+=("$line")
  done < <(json_read_array "$CONFIG_FILE" "installed_layers")
}

# =============================================================================
# Toolkit root discovery
# =============================================================================

# discover_toolkit_root — derive toolkit root from script location.
# scripts/post-update.sh lives one level below the toolkit root.
discover_toolkit_root() {
  cd "$SCRIPT_DIR/.." && pwd
}

# =============================================================================
# Output helpers
# =============================================================================

# emit STATUS ITEM MESSAGE
# Prints: [STATUS] item — message
emit() {
  local status="$1"
  local item="$2"
  local message="$3"
  printf '[%s] %s \xe2\x80\x94 %s\n' "$status" "$item" "$message"
}

# emit_section NAME
# Prints: === NAME ===
emit_section() {
  local name="$1"
  printf '=== %s ===\n' "$name"
}

# emit_summary TEXT
# Prints: [INFO] TEXT
emit_summary() {
  local text="$1"
  printf '[INFO] %s\n' "$text"
}

# =============================================================================
# Phases
# =============================================================================

phase_self_check() {
  emit_section "Self-Check"

  local checks_passed=0
  local checks_failed=0

  # ---- 1. node available -------------------------------------------------------
  local node_ver
  if node_ver="$(node --version 2>/dev/null)"; then
    emit "OK" "node" "found (${node_ver})"
    checks_passed=$((checks_passed + 1))
  else
    emit "FAIL" "node" "not found — node is required"
    checks_failed=$((checks_failed + 1))
  fi

  # ---- 2. config.json exists and is parseable ----------------------------------
  local config_ok=0
  if [ ! -f "$CONFIG_FILE" ]; then
    emit "FAIL" "config.json" "not found: $CONFIG_FILE"
    checks_failed=$((checks_failed + 1))
  else
    local node_config
    node_config="$(to_node_path "$CONFIG_FILE")"
    if node -e "JSON.parse(require('fs').readFileSync('${node_config}','utf8'))" 2>/dev/null; then
      emit "OK" "config.json" "valid"
      checks_passed=$((checks_passed + 1))
      config_ok=1
    else
      emit "FAIL" "config.json" "invalid JSON: $CONFIG_FILE"
      checks_failed=$((checks_failed + 1))
    fi
  fi

  # ---- 3 & 4. toolkit_root exists and contains VERSION; stale check -----------
  if [ "$config_ok" -eq 1 ]; then
    local cfg_toolkit_root
    if cfg_toolkit_root="$(json_read "$CONFIG_FILE" "toolkit_root" 2>/dev/null)"; then
      if [ -d "$cfg_toolkit_root" ] && [ -f "$cfg_toolkit_root/VERSION" ]; then
        emit "OK" "toolkit_root" "$cfg_toolkit_root"
        checks_passed=$((checks_passed + 1))
      else
        # Directory missing or no VERSION — compare with discovered root
        local discovered
        discovered="$(discover_toolkit_root)"
        if [ "$cfg_toolkit_root" != "$discovered" ]; then
          emit "FAIL" "toolkit_root" "stale: config has '$cfg_toolkit_root', script suggests '$discovered'"
        else
          emit "FAIL" "toolkit_root" "missing or incomplete: $cfg_toolkit_root (no VERSION file)"
        fi
        checks_failed=$((checks_failed + 1))
      fi
    else
      emit "FAIL" "toolkit_root" "key not found in config"
      checks_failed=$((checks_failed + 1))
    fi

    # ---- 5. installed_layers is non-empty --------------------------------------
    local layers=""
    local layer_count=0
    while IFS= read -r line; do
      if [ -n "$line" ]; then
        layer_count=$((layer_count + 1))
        if [ -z "$layers" ]; then
          layers="$line"
        else
          layers="${layers}, ${line}"
        fi
      fi
    done < <(json_read_array "$CONFIG_FILE" "installed_layers" 2>/dev/null || true)

    if [ "$layer_count" -gt 0 ]; then
      emit "OK" "installed_layers" "$layers"
      checks_passed=$((checks_passed + 1))
    else
      emit "FAIL" "installed_layers" "empty or missing — at least one layer required"
      checks_failed=$((checks_failed + 1))
    fi
  fi

  # ---- 6. Windows symlink creation test ----------------------------------------
  if [ "$PLATFORM" = "windows" ]; then
    local tmp_target tmp_link
    tmp_target="$(mktemp)"
    tmp_link="${tmp_target}.symlink"

    if ln -s "$tmp_target" "$tmp_link" 2>/dev/null && [ -L "$tmp_link" ]; then
      emit "OK" "symlinks" "creation test passed (windows)"
      checks_passed=$((checks_passed + 1))
    else
      emit "FAIL" "symlinks" "cannot create (Developer Mode may be disabled)"
      checks_failed=$((checks_failed + 1))
    fi
    rm -f "$tmp_target" "$tmp_link"
  fi

  # ---- Summary -----------------------------------------------------------------
  emit_summary "${checks_passed} checks passed, ${checks_failed} failed"

  if [ "$checks_failed" -gt 0 ]; then
    return 1
  fi
}

phase_refresh() {
  # Counters
  local new_count=0
  local refreshed_count=0
  local converted_count=0
  local failed_count=0

  # Ensure target directories exist
  mkdir -p "$CLAUDE_HOME/hooks" "$CLAUDE_HOME/commands" "$CLAUDE_HOME/skills"

  # ---------------------------------------------------------------------------
  # Helper: link_file SOURCE TARGET
  # Creates/refreshes a symlink from TARGET -> SOURCE.
  # Reports [OK] if already a symlink, [WARN]+converts if a regular file,
  # [NEW] if it doesn't exist.
  # Uses only [ -L ] for symlink detection (no readlink comparison).
  # ---------------------------------------------------------------------------
  link_file() {
    local source="$1"
    local target="$2"
    local name
    name="$(basename "$target")"

    if [ -L "$target" ]; then
      # Already a symlink — refresh in place (ln -sf is idempotent)
      if ln -sf "$source" "$target" 2>/dev/null; then
        emit "OK" "$name" "symlink verified"
        refreshed_count=$((refreshed_count + 1))
      else
        emit "FAIL" "$name" "could not refresh symlink"
        failed_count=$((failed_count + 1))
      fi
    elif [ -f "$target" ]; then
      # Regular file (copy) — convert to symlink
      if rm -f "$target" && ln -sf "$source" "$target" 2>/dev/null; then
        emit "WARN" "$name" "converted regular file to symlink"
        converted_count=$((converted_count + 1))
      else
        emit "FAIL" "$name" "could not convert to symlink"
        failed_count=$((failed_count + 1))
      fi
    else
      # Does not exist — create new symlink
      if ln -sf "$source" "$target" 2>/dev/null; then
        emit "NEW" "$name" "symlink created"
        new_count=$((new_count + 1))
      else
        emit "FAIL" "$name" "could not create symlink"
        failed_count=$((failed_count + 1))
      fi
    fi
  }

  # ---------------------------------------------------------------------------
  # Helper: link_dir SOURCE TARGET
  # Like link_file but uses ln -sfn for directory symlinks.
  # ---------------------------------------------------------------------------
  link_dir() {
    local source="$1"
    local target="$2"
    local name
    name="$(basename "$target")"

    if [ -L "$target" ]; then
      if ln -sfn "$source" "$target" 2>/dev/null; then
        emit "OK" "$name" "symlink verified"
        refreshed_count=$((refreshed_count + 1))
      else
        emit "FAIL" "$name" "could not refresh symlink"
        failed_count=$((failed_count + 1))
      fi
    elif [ -d "$target" ] && [ ! -L "$target" ]; then
      emit "WARN" "$name" "real directory exists — skipping (manual intervention required)"
      failed_count=$((failed_count + 1))
    else
      if ln -sfn "$source" "$target" 2>/dev/null; then
        emit "NEW" "$name" "symlink created"
        new_count=$((new_count + 1))
      else
        emit "FAIL" "$name" "could not create symlink"
        failed_count=$((failed_count + 1))
      fi
    fi
  }

  # ===========================================================================
  # Section 1: Shell Hooks (.sh files, excluding statusline.sh)
  # ===========================================================================
  emit_section "Symlink Refresh: Hooks"

  local layer file filename
  for layer in "${INSTALLED_LAYERS[@]}"; do
    local hooks_dir="$TOOLKIT_ROOT/$layer/hooks"
    [ -d "$hooks_dir" ] || continue
    for file in "$hooks_dir"/*.sh; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      [ "$filename" = "statusline.sh" ] && continue
      link_file "$file" "$CLAUDE_HOME/hooks/$filename"
    done
  done

  # ===========================================================================
  # Section 2: Utilities (.js files from core/hooks)
  # ===========================================================================
  emit_section "Symlink Refresh: Utilities"

  local js_dir="$TOOLKIT_ROOT/core/hooks"
  if [ -d "$js_dir" ]; then
    for file in "$js_dir"/*.js; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      link_file "$file" "$CLAUDE_HOME/hooks/$filename"
    done
  fi


  # ===========================================================================
  # Section 2b: Shared Libraries (lib/ subdirectory)
  # ===========================================================================
  emit_section "Symlink Refresh: Shared Libraries"

  local lib_src="$TOOLKIT_ROOT/core/hooks/lib"
  if [ -d "$lib_src" ]; then
    mkdir -p "$CLAUDE_HOME/hooks/lib"
    for file in "$lib_src"/*.sh; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      link_file "$file" "$CLAUDE_HOME/hooks/lib/$filename"
    done
  fi

  # ===========================================================================
  # Section 2c: Migrations (migrations/ subdirectory)
  # ===========================================================================
  emit_section "Symlink Refresh: Migrations"

  local migrations_src="$TOOLKIT_ROOT/core/hooks/migrations"
  if [ -d "$migrations_src" ]; then
    mkdir -p "$CLAUDE_HOME/hooks/migrations"
    for file in "$migrations_src"/*; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      link_file "$file" "$CLAUDE_HOME/hooks/migrations/$filename"
    done
  fi

  # ===========================================================================
  # Section 3: Statusline
  # ===========================================================================
  emit_section "Symlink Refresh: Statusline"

  local statusline_src="$TOOLKIT_ROOT/core/hooks/statusline.sh"
  if [ -f "$statusline_src" ]; then
    link_file "$statusline_src" "$CLAUDE_HOME/statusline.sh"
  else
    emit "WARN" "statusline.sh" "source not found: $statusline_src"
  fi

  # ===========================================================================
  # Section 4: Commands (.md files from core/commands)
  # ===========================================================================
  emit_section "Symlink Refresh: Commands"

  local commands_dir="$TOOLKIT_ROOT/core/commands"
  if [ -d "$commands_dir" ]; then
    for file in "$commands_dir"/*.md; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      link_file "$file" "$CLAUDE_HOME/commands/$filename"
    done
  fi

  # ===========================================================================
  # Section 5: Skills (directories)
  # ===========================================================================
  emit_section "Symlink Refresh: Skills"

  local skill_dir skill_name
  for layer in "${INSTALLED_LAYERS[@]}"; do
    local skills_root="$TOOLKIT_ROOT/$layer/skills"
    [ -d "$skills_root" ] || continue
    for skill_dir in "$skills_root"/*/; do
      [ -d "$skill_dir" ] || continue
      skill_name="$(basename "$skill_dir")"
      link_dir "$skill_dir" "$CLAUDE_HOME/skills/$skill_name"
    done
  done

  # ===========================================================================
  # Summary
  # ===========================================================================
  emit_summary "${new_count} new, ${refreshed_count} refreshed, ${converted_count} converted, ${failed_count} failed"

  if [ "$failed_count" -gt 0 ]; then
    return 1
  fi
}

_build_known_files() {
  # Returns a newline-separated list of basenames managed by the toolkit.
  # Includes: *.sh from each installed layer's hooks/ (excluding statusline.sh)
  #           *.js from core/hooks/
  # Does NOT include statusline.sh (lives at $CLAUDE_HOME/statusline.sh, not hooks/).
  local known=""
  local layer file filename

  for layer in "${INSTALLED_LAYERS[@]}"; do
    local hooks_dir="$TOOLKIT_ROOT/$layer/hooks"
    [ -d "$hooks_dir" ] || continue
    for file in "$hooks_dir"/*.sh; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      [ "$filename" = "statusline.sh" ] && continue
      if [ -z "$known" ]; then
        known="$filename"
      else
        known="${known}
${filename}"
      fi
    done
  done

  local js_dir="$TOOLKIT_ROOT/core/hooks"
  if [ -d "$js_dir" ]; then
    for file in "$js_dir"/*.js; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      if [ -z "$known" ]; then
        known="$filename"
      else
        known="${known}
${filename}"
      fi
    done
  fi

  printf '%s' "$known"
}

phase_orphans() {
  emit_section "Orphan Detection"

  local known_files
  known_files="$(_build_known_files)"

  local orphan_count=0
  local file filename

  for file in "$CLAUDE_HOME/hooks/"*; do
    [ -d "$file" ] && continue
    { [ -f "$file" ] || [ -L "$file" ]; } || continue
    filename="$(basename "$file")"
    if ! echo "$known_files" | grep -qxF "$filename"; then
      emit "ORPHAN" "$filename" "not in toolkit manifest"
      orphan_count=$((orphan_count + 1))
    fi
  done

  # Also scan skills directory for orphans
  if [ -d "$CLAUDE_HOME/skills" ]; then
    local known_skills=""
    local layer
    for layer in $(_get_installed_layers); do
      local skill_dir="$TOOLKIT_ROOT/$layer/skills"
      if [ -d "$skill_dir" ]; then
        local s
        for s in "$skill_dir"/*/; do
          [ -d "$s" ] && known_skills="$known_skills$(basename "$s")\n"
        done
      fi
    done
    # Also include core skills
    if [ -d "$TOOLKIT_ROOT/core/skills" ]; then
      local s
      for s in "$TOOLKIT_ROOT/core/skills"/*/; do
        [ -d "$s" ] && known_skills="$known_skills$(basename "$s")\n"
      done
    fi

    local skill
    for skill in "$CLAUDE_HOME/skills"/*/; do
      [ -d "$skill" ] || continue
      local skill_name
      skill_name="$(basename "$skill")"
      if ! printf '%b' "$known_skills" | grep -qxF "$skill_name"; then
        emit "ORPHAN" "skills/$skill_name" "not in toolkit manifest"
        orphan_count=$((orphan_count + 1))
      fi
    done
  fi

  if [ "$orphan_count" -gt 0 ]; then
    emit_summary "${orphan_count} orphan(s) found — awaiting user decision"
  else
    emit_summary "no orphans found"
  fi
}

phase_remove_orphan() {
  local filename="${1:-}"

  if [ -z "$filename" ]; then
    emit "FAIL" "remove-orphan" "no filename specified"
    exit 1
  fi

  local target="$CLAUDE_HOME/hooks/$filename"

  # Safety check 1: file must exist
  if [ ! -f "$target" ] && [ ! -L "$target" ]; then
    emit "FAIL" "$filename" "not found at $target"
    exit 1
  fi

  # Safety check 2: must NOT be in the known toolkit set
  local known_files
  known_files="$(_build_known_files)"
  if echo "$known_files" | grep -qxF "$filename"; then
    emit "FAIL" "$filename" "is a toolkit hook, refusing to delete"
    exit 1
  fi

  # Safe to remove
  if rm "$target"; then
    emit "OK" "$filename" "removed"
  else
    emit "FAIL" "$filename" "could not remove"
    exit 1
  fi
}

phase_verify() {
  local ok_count=0
  local warn_count=0
  local fail_count=0

  # ===========================================================================
  # Section 1: File Freshness
  # ===========================================================================
  emit_section "Verify: File Freshness"

  # Helper: check_file_freshness NAME TARGET
  # Checks if target exists and whether it is a symlink or a regular file copy.
  _check_freshness() {
    local name="$1"
    local target="$2"

    if [ -L "$target" ]; then
      emit "OK" "$name" "symlink"
      ok_count=$((ok_count + 1))
    elif [ -f "$target" ] || [ -d "$target" ]; then
      emit "WARN" "$name" "copy, not symlink"
      warn_count=$((warn_count + 1))
    else
      emit "FAIL" "$name" "missing"
      fail_count=$((fail_count + 1))
    fi
  }

  # --- Shell hooks (.sh, excluding statusline.sh) ---
  local layer file filename
  for layer in "${INSTALLED_LAYERS[@]}"; do
    local hooks_dir="$TOOLKIT_ROOT/$layer/hooks"
    [ -d "$hooks_dir" ] || continue
    for file in "$hooks_dir"/*.sh; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      [ "$filename" = "statusline.sh" ] && continue
      _check_freshness "$filename" "$CLAUDE_HOME/hooks/$filename"
    done
  done

  # --- JS utilities from core/hooks ---
  local js_dir="$TOOLKIT_ROOT/core/hooks"
  if [ -d "$js_dir" ]; then
    for file in "$js_dir"/*.js; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      _check_freshness "$filename" "$CLAUDE_HOME/hooks/$filename"
    done
  fi

  # --- Shared libraries (lib/ subdirectory) ---
  local lib_src="$TOOLKIT_ROOT/core/hooks/lib"
  if [ -d "$lib_src" ]; then
    for file in "$lib_src"/*.sh; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      _check_freshness "lib/$filename" "$CLAUDE_HOME/hooks/lib/$filename"
    done
  fi

  # --- Migrations (migrations/ subdirectory) ---
  local migrations_src="$TOOLKIT_ROOT/core/hooks/migrations"
  if [ -d "$migrations_src" ]; then
    for file in "$migrations_src"/*; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      _check_freshness "migrations/$filename" "$CLAUDE_HOME/hooks/migrations/$filename"
    done
  fi

  # --- Statusline ---
  local statusline_src="$TOOLKIT_ROOT/core/hooks/statusline.sh"
  if [ -f "$statusline_src" ]; then
    _check_freshness "statusline.sh" "$CLAUDE_HOME/statusline.sh"
  fi

  # --- Commands (.md from core/commands) ---
  local commands_dir="$TOOLKIT_ROOT/core/commands"
  if [ -d "$commands_dir" ]; then
    for file in "$commands_dir"/*.md; do
      [ -f "$file" ] || continue
      filename="$(basename "$file")"
      _check_freshness "$filename" "$CLAUDE_HOME/commands/$filename"
    done
  fi

  # --- Skills (directories from each layer) ---
  local skill_dir skill_name
  for layer in "${INSTALLED_LAYERS[@]}"; do
    local skills_root="$TOOLKIT_ROOT/$layer/skills"
    [ -d "$skills_root" ] || continue
    for skill_dir in "$skills_root"/*/; do
      [ -d "$skill_dir" ] || continue
      skill_name="$(basename "$skill_dir")"
      _check_freshness "$skill_name" "$CLAUDE_HOME/skills/$skill_name"
    done
  done

  # ===========================================================================
  # Section 2: Settings Registration
  # ===========================================================================
  emit_section "Verify: Settings Registration"

  local settings_file="$CLAUDE_HOME/settings.json"
  if [ ! -f "$settings_file" ]; then
    emit "FAIL" "settings.json" "file not found"
    fail_count=$((fail_count + 1))
  else
    local node_settings
    node_settings="$(to_node_path "$settings_file")"

    # Use node to check all expected hook registrations in one call.
    # Output: one line per check, format: OK|FAIL <tab> trigger <tab> hookname <tab> detail
    local node_output
    node_output="$(node -e "
      var fs = require('fs');
      var settings = JSON.parse(fs.readFileSync('${node_settings}', 'utf8'));
      var hooks = settings.hooks || {};

      // Expected registrations: [trigger, matcher, hookFilename]
      var expected = [
        ['SessionStart',      'startup',    'session-start.sh'],
        ['PreToolUse',        'Write|Edit', 'write-guard.sh'],
        ['PreToolUse',        'Bash|Agent', 'worktree-guard.sh'],
        ['PostToolUse',       'Write|Edit', 'git-sync.sh'],
        ['PostToolUse',       'Write|Edit', 'personal-sync.sh'],
        ['PostToolUse',       '.*',         'title-update.sh'],
        ['UserPromptSubmit',  '.*',         'todo-capture.sh'],
        ['Stop',              '.*',         'checklist-reminder.sh'],
        ['Stop',              '.*',         'done-sound.sh']
      ];

      expected.forEach(function(row) {
        var trigger = row[0];
        var expectedMatcher = row[1];
        var hookFile = row[2];
        var found = false;
        var foundMatcher = '';

        var entries = hooks[trigger];
        if (Array.isArray(entries)) {
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var hooksArr = entry.hooks || [];
            for (var j = 0; j < hooksArr.length; j++) {
              var cmd = hooksArr[j].command || '';
              if (cmd.indexOf(hookFile) !== -1) {
                found = true;
                foundMatcher = entry.matcher || '';
                break;
              }
            }
            if (found) break;
          }
        }

        if (found) {
          console.log('OK\t' + trigger + '\t' + hookFile + '\tregistered (matcher: ' + foundMatcher + ')');
        } else {
          console.log('FAIL\t' + trigger + '\t' + hookFile + '\tnot found');
        }
      });

      // Check statusLine
      var sl = settings.statusLine;
      if (sl && sl.command) {
        // Extract the file path referenced in the command and check it exists
        var parts = sl.command.split(/\\s+/);
        var slPath = parts[parts.length - 1];
        // Attempt to resolve — try the raw path first
        var slExists = false;
        try { fs.accessSync(slPath); slExists = true; } catch(e) {}
        if (slExists) {
          console.log('OK\tstatusLine\tstatusLine\tconfigured and file exists');
        } else {
          console.log('WARN\tstatusLine\tstatusLine\tconfigured but file not accessible at ' + slPath);
        }
      } else {
        console.log('FAIL\tstatusLine\tstatusLine\tnot configured in settings.json');
      }
    " 2>/dev/null || echo "FAIL	settings.json	node	settings verification script failed")"

    # Parse node output and emit results
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      local status trigger hookname detail
      status="$(echo "$line" | cut -f1)"
      trigger="$(echo "$line" | cut -f2)"
      hookname="$(echo "$line" | cut -f3)"
      detail="$(echo "$line" | cut -f4)"

      emit "$status" "$trigger" "$hookname $detail"
      case "$status" in
        OK)   ok_count=$((ok_count + 1)) ;;
        WARN) warn_count=$((warn_count + 1)) ;;
        FAIL) fail_count=$((fail_count + 1)) ;;
      esac
    done <<EOF
$node_output
EOF
  fi

  # ===========================================================================
  # Section 3: Feature Pipeline
  # ===========================================================================
  emit_section "Verify: Feature Pipeline"

  # 1. Session Naming
  if [ -f "$CLAUDE_HOME/hooks/title-update.sh" ] || [ -L "$CLAUDE_HOME/hooks/title-update.sh" ]; then
    if [ -d "$CLAUDE_HOME/topics" ]; then
      emit "OK" "Session Naming" "title-update.sh installed, topics/ exists"
      ok_count=$((ok_count + 1))
    else
      emit "WARN" "Session Naming" "title-update.sh installed, topics/ missing (created on first use)"
      warn_count=$((warn_count + 1))
    fi
  else
    emit "FAIL" "Session Naming" "title-update.sh missing from hooks"
    fail_count=$((fail_count + 1))
  fi

  # 2. Sync Status
  if [ -f "$CLAUDE_HOME/hooks/git-sync.sh" ] || [ -L "$CLAUDE_HOME/hooks/git-sync.sh" ]; then
    if [ -f "$CLAUDE_HOME/.sync-status" ]; then
      emit "OK" "Sync Status" "git-sync.sh installed, .sync-status exists"
      ok_count=$((ok_count + 1))
    else
      emit "OK" "Sync Status" "git-sync.sh installed, .sync-status created on first write"
      ok_count=$((ok_count + 1))
    fi
  else
    emit "FAIL" "Sync Status" "git-sync.sh missing from hooks"
    fail_count=$((fail_count + 1))
  fi

  # 3. Announcements
  if [ -f "$CLAUDE_HOME/hooks/announcement-fetch.js" ] || [ -L "$CLAUDE_HOME/hooks/announcement-fetch.js" ]; then
    emit "OK" "Announcements" "announcement-fetch.js installed"
    ok_count=$((ok_count + 1))
  else
    emit "FAIL" "Announcements" "announcement-fetch.js missing from hooks"
    fail_count=$((fail_count + 1))
  fi

  # 4. Version Check
  if [ -f "$CLAUDE_HOME/toolkit-state/update-status.json" ]; then
    emit "OK" "Version Check" "update-status.json exists"
    ok_count=$((ok_count + 1))
  else
    emit "WARN" "Version Check" "update-status.json missing (created on first update check)"
    warn_count=$((warn_count + 1))
  fi

  # 5. Rate Limits
  if [ -f "$CLAUDE_HOME/hooks/usage-fetch.js" ] || [ -L "$CLAUDE_HOME/hooks/usage-fetch.js" ]; then
    emit "OK" "Rate Limits" "usage-fetch.js installed"
    ok_count=$((ok_count + 1))
  else
    emit "FAIL" "Rate Limits" "usage-fetch.js missing from hooks"
    fail_count=$((fail_count + 1))
  fi

  # 6. Statusline
  if [ -f "$CLAUDE_HOME/statusline.sh" ] || [ -L "$CLAUDE_HOME/statusline.sh" ]; then
    # Check settings.json has statusLine entry (quick grep; node already checked above)
    if [ -f "$CLAUDE_HOME/settings.json" ] && grep -q '"statusLine"' "$CLAUDE_HOME/settings.json" 2>/dev/null; then
      emit "OK" "Statusline" "statusline.sh installed, settings.json configured"
      ok_count=$((ok_count + 1))
    else
      emit "WARN" "Statusline" "statusline.sh installed, but settings.json missing statusLine entry"
      warn_count=$((warn_count + 1))
    fi
  else
    emit "FAIL" "Statusline" "statusline.sh missing"
    fail_count=$((fail_count + 1))
  fi

  # ===========================================================================
  # Summary
  # ===========================================================================
  emit_summary "${ok_count} OK, ${warn_count} WARN, ${fail_count} FAIL"

  if [ "$fail_count" -gt 0 ]; then
    return 1
  fi
}

phase_mcps() {
  emit_section "MCP Servers"

  local manifest_file="$TOOLKIT_ROOT/core/mcp-manifest.json"
  local claude_json="$HOME/.claude.json"

  if [ ! -f "$manifest_file" ]; then
    emit "FAIL" "mcp-manifest" "not found: $manifest_file"
    return 1
  fi

  if [ ! -f "$claude_json" ]; then
    emit "WARN" "claude.json" "not found: $claude_json — cannot check registrations"
    return 0
  fi

  local node_manifest node_claude_json
  node_manifest="$(to_node_path "$manifest_file")"
  node_claude_json="$(to_node_path "$claude_json")"

  node -e "
    var fs = require('fs');
    var platform = '${PLATFORM}';

    var manifest;
    try {
      manifest = JSON.parse(fs.readFileSync('${node_manifest}', 'utf8'));
    } catch(e) {
      process.stderr.write('Failed to parse mcp-manifest.json: ' + e.message + '\n');
      process.exit(1);
    }

    var claudeObj;
    try {
      claudeObj = JSON.parse(fs.readFileSync('${node_claude_json}', 'utf8'));
    } catch(e) {
      process.stderr.write('Failed to parse .claude.json: ' + e.message + '\n');
      process.exit(1);
    }

    // Collect all mcpServers keys by walking the entire object tree.
    var registered = {};
    function collectMcpKeys(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(collectMcpKeys); return; }
      if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
        Object.keys(obj.mcpServers).forEach(function(k) { registered[k] = true; });
      }
      Object.keys(obj).forEach(function(k) { collectMcpKeys(obj[k]); });
    }
    collectMcpKeys(claudeObj);

    var newAuto = 0;
    var newManual = 0;

    manifest.forEach(function(entry) {
      var name = entry.name;
      var entryPlatform = entry.platform || 'all';
      var auto = entry.auto === true;

      if (entryPlatform !== 'all' && entryPlatform !== platform) {
        process.stdout.write('[SKIP] ' + name + ' \xe2\x80\x94 wrong platform (' + entryPlatform + ')\n');
        return;
      }

      if (registered[name]) {
        process.stdout.write('[OK] ' + name + ' \xe2\x80\x94 registered\n');
      } else if (auto) {
        process.stdout.write('[NEW] ' + name + ' \xe2\x80\x94 available (auto-install, run /health)\n');
        newAuto++;
      } else {
        process.stdout.write('[INFO] ' + name + ' \xe2\x80\x94 available (requires setup, run /setup-wizard)\n');
        newManual++;
      }
    });

    if (newAuto === 0 && newManual === 0) {
      process.stdout.write('[INFO] all platform MCPs registered\n');
    } else {
      var parts = [];
      if (newAuto > 0) parts.push(newAuto + ' auto-install available');
      if (newManual > 0) parts.push(newManual + ' requiring manual setup');
      process.stdout.write('[INFO] ' + parts.join(', ') + '\n');
    }
  "
}

phase_plugins() {
  emit_section "Marketplace Plugins"

  local manifest_file="$TOOLKIT_ROOT/core/plugins-manifest.json"
  local settings_file="$CLAUDE_HOME/settings.json"

  if [ ! -f "$manifest_file" ]; then
    emit "FAIL" "plugins-manifest" "not found: $manifest_file"
    return 1
  fi

  if [ ! -f "$settings_file" ]; then
    emit "WARN" "settings.json" "not found: $settings_file — cannot check registrations"
    return 0
  fi

  local node_manifest node_settings
  node_manifest="$(to_node_path "$manifest_file")"
  node_settings="$(to_node_path "$settings_file")"

  node -e "
    var fs = require('fs');

    var manifest;
    try {
      manifest = JSON.parse(fs.readFileSync('${node_manifest}', 'utf8'));
    } catch(e) {
      process.stderr.write('Failed to parse plugins-manifest.json: ' + e.message + '\n');
      process.exit(1);
    }

    var settingsObj;
    try {
      settingsObj = JSON.parse(fs.readFileSync('${node_settings}', 'utf8'));
    } catch(e) {
      process.stderr.write('Failed to parse settings.json: ' + e.message + '\n');
      process.exit(1);
    }

    var enabled = settingsObj.enabledPlugins || {};
    var unregistered = 0;

    manifest.forEach(function(plugin) {
      if (enabled[plugin]) {
        process.stdout.write('[OK] ' + plugin + ' \xe2\x80\x94 registered\n');
      } else {
        process.stdout.write('[NEW] ' + plugin + ' \xe2\x80\x94 not registered\n');
        unregistered++;
      }
    });

    if (unregistered === 0) {
      process.stdout.write('[INFO] all plugins registered\n');
    } else {
      process.stdout.write('[INFO] ' + unregistered + ' unregistered plugin(s) found\n');
    }
  "
}

# version_gt A B
# Returns 0 (true) if A > B, 1 (false) otherwise.
# Uses node for portable semver comparison (sort -V is GNU-only, fails on macOS stock).
version_gt() {
  if command -v node &>/dev/null; then
    node -e "const[a,b]=process.argv.slice(1).map(v=>v.split('.').map(Number));for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))process.exit(0);if((a[i]||0)<(b[i]||0))process.exit(1)}process.exit(1)" "$1" "$2"
  else
    local higher
    higher="$(printf '%s\n%s' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
    [ "$higher" = "$1" ] && [ "$1" != "$2" ]
  fi
}

phase_migrations() {
  local from_ver="${1:-}"
  local to_ver="${2:-}"

  # Guard: need both version bounds
  if [ -z "$from_ver" ] || [ -z "$to_ver" ]; then
    emit "INFO" "migrations" "skipped — no version range provided"
    return
  fi

  local migrations_dir="$TOOLKIT_ROOT/scripts/migrations"

  # Guard: directory must exist and contain at least one .sh file
  if [ ! -d "$migrations_dir" ]; then
    emit "INFO" "migrations" "no migrations needed (${from_ver} → ${to_ver})"
    return
  fi

  # Collect .sh files; check if any exist
  local has_any=0
  local f
  for f in "$migrations_dir"/*.sh; do
    [ -f "$f" ] && has_any=1 && break
  done

  if [ "$has_any" -eq 0 ]; then
    emit "INFO" "migrations" "no migrations needed (${from_ver} → ${to_ver})"
    return
  fi

  # Gather applicable migration versions into a newline-delimited string,
  # then sort with sort -V.
  local applicable_versions=""
  for f in "$migrations_dir"/*.sh; do
    [ -f "$f" ] || continue
    local fname
    fname="$(basename "$f" .sh)"
    # Apply if fname > from_ver AND fname <= to_ver
    # i.e. version_gt fname from_ver  AND  NOT version_gt fname to_ver
    if version_gt "$fname" "$from_ver" && ! version_gt "$fname" "$to_ver"; then
      if [ -z "$applicable_versions" ]; then
        applicable_versions="$fname"
      else
        applicable_versions="${applicable_versions}
${fname}"
      fi
    fi
  done

  if [ -z "$applicable_versions" ]; then
    emit "INFO" "migrations" "no migrations needed (${from_ver} → ${to_ver})"
    return
  fi

  # Sort versions and run each migration in order
  local sorted_versions
  sorted_versions="$(printf '%s\n' "$applicable_versions" | sort -t. -k1,1n -k2,2n -k3,3n)"

  export TOOLKIT_ROOT CLAUDE_HOME PLATFORM

  local version
  while IFS= read -r version; do
    [ -z "$version" ] && continue
    local migration_file="$migrations_dir/${version}.sh"
    emit_section "Migration ${version}"
    bash "$migration_file"
  done <<EOF
$sorted_versions
EOF
}

phase_post_update() {
  local from_ver="${1:-}"
  local to_ver="${2:-}"
  local overall_exit=0

  phase_self_check || overall_exit=1
  echo ""

  if [ -n "$from_ver" ] && [ -n "$to_ver" ]; then
    phase_migrations "$from_ver" "$to_ver" || overall_exit=1
  else
    emit_summary "migrations skipped — no version range provided"
  fi
  echo ""

  phase_refresh || overall_exit=1
  echo ""

  phase_orphans || overall_exit=1
  echo ""

  phase_verify || overall_exit=1
  echo ""

  phase_mcps || overall_exit=1
  echo ""

  phase_plugins || overall_exit=1

  return $overall_exit
}

# =============================================================================
# Main dispatcher
# =============================================================================

main() {
  detect_platform

  local phase="${1:-}"

  # self-check validates config itself; all other phases need config loaded first
  if [ "$phase" != "self-check" ]; then
    load_config
  fi

  case "$phase" in
    self-check)
      phase_self_check
      ;;
    refresh)
      phase_refresh
      ;;
    orphans)
      phase_orphans
      ;;
    remove-orphan)
      phase_remove_orphan "${2:-}"
      ;;
    verify)
      phase_verify
      ;;
    mcps)
      phase_mcps
      ;;
    plugins)
      phase_plugins
      ;;
    migrations)
      phase_migrations "${2:-}" "${3:-}"
      ;;
    post-update)
      phase_post_update "${2:-}" "${3:-}"
      ;;
    *)
      emit "FAIL" "unknown phase: ${1:-}" "use: self-check|refresh|orphans|remove-orphan|verify|mcps|plugins|migrations|post-update"
      exit 2
      ;;
  esac
}

main "$@"
