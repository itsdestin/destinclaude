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
# JSON helpers
# =============================================================================

# json_read FILE KEY
# Reads a single string value from a JSON file using node.
json_read() {
  local file="$1"
  local key="$2"
  node -e "
    try {
      var d = require('fs').readFileSync('${file}', 'utf8');
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
  node -e "
    try {
      var d = require('fs').readFileSync('${file}', 'utf8');
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
# Phase stubs
# =============================================================================

phase_self_check() {
  emit_summary "self-check: not yet implemented"
}

phase_refresh() {
  emit_summary "refresh: not yet implemented"
}

phase_orphans() {
  emit_summary "orphans: not yet implemented"
}

phase_remove_orphan() {
  local target="${1:-}"
  emit_summary "remove-orphan (${target}): not yet implemented"
}

phase_verify() {
  emit_summary "verify: not yet implemented"
}

phase_mcps() {
  emit_summary "mcps: not yet implemented"
}

phase_plugins() {
  emit_summary "plugins: not yet implemented"
}

phase_migrations() {
  local from_ver="${1:-}"
  local to_ver="${2:-}"
  emit_summary "migrations (${from_ver} -> ${to_ver}): not yet implemented"
}

phase_post_update() {
  emit_summary "post-update: not yet implemented"
}

# =============================================================================
# Main dispatcher
# =============================================================================

main() {
  detect_platform

  local phase="${1:-}"

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
      phase_post_update
      ;;
    *)
      emit "FAIL" "unknown phase: ${1:-}" "use: self-check|refresh|orphans|remove-orphan|verify|mcps|plugins|migrations|post-update"
      exit 2
      ;;
  esac
}

main "$@"
