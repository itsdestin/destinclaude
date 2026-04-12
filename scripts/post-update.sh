#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# post-update.sh — Post-merge hook dispatcher for destinclaude-core
#
# Runs after git merge (via .git/hooks/post-merge). In the decomposed toolkit,
# most responsibilities (hook reconciliation, MCP registration, plugin registry
# maintenance, dependency checks, marketplace updates) are owned by the host
# DestinCode app, which runs reconcilers on install and at launch. This script
# only handles:
#   - self-check: verify the core package is present and valid
#   - migrations: run version-specific data migrations
#   - verify:     confirm hook scripts exist at the paths settings.json expects
# =============================================================================

# --- Constants ----------------------------------------------------------------

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
TOOLKIT_ROOT="$HOME/.claude/plugins/destinclaude-core"
STATE_DIR="$CLAUDE_HOME/toolkit-state"
MIGRATION_MARKER="$STATE_DIR/last-migrated-version"

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
# Path / platform helpers
# =============================================================================

PLATFORM=""

detect_platform() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null || true)"
  case "$uname_out" in
    Darwin*)                  PLATFORM="macos"   ;;
    Linux*)                   PLATFORM="linux"   ;;
    MINGW*|MSYS*|CYGWIN*)     PLATFORM="windows"; export MSYS=winsymlinks:nativestrict ;;
    *)                        PLATFORM="unknown" ;;
  esac
}

# to_node_path — convert /c/Users/... to C:/Users/... on MSYS so Node can open it.
to_node_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  else
    printf '%s' "$p"
  fi
}

# =============================================================================
# Output helpers
# =============================================================================

emit() {
  local status="$1" item="$2" message="$3"
  printf '[%s] %s \xe2\x80\x94 %s\n' "$status" "$item" "$message"
}

emit_section() { printf '=== %s ===\n' "$1"; }
emit_summary() { printf '[INFO] %s\n' "$1"; }

# =============================================================================
# Version helpers
# =============================================================================

# version_gt A B — returns 0 (true) if A > B. Portable (sort -V is GNU-only).
version_gt() {
  if command -v node &>/dev/null; then
    node -e "const[a,b]=process.argv.slice(1).map(v=>v.split('.').map(Number));for(let i=0;i<3;i++){if((a[i]||0)>(b[i]||0))process.exit(0);if((a[i]||0)<(b[i]||0))process.exit(1)}process.exit(1)" "$1" "$2"
  else
    local higher
    higher="$(printf '%s\n%s' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)"
    [ "$higher" = "$1" ] && [ "$1" != "$2" ]
  fi
}

read_current_version() {
  # Read VERSION file from the core package. Empty string if missing.
  if [ -f "$TOOLKIT_ROOT/VERSION" ]; then
    tr -d '[:space:]' < "$TOOLKIT_ROOT/VERSION"
  else
    printf ''
  fi
}

read_last_migrated() {
  if [ -f "$MIGRATION_MARKER" ]; then
    tr -d '[:space:]' < "$MIGRATION_MARKER"
  else
    printf ''
  fi
}

write_last_migrated() {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$1" > "$MIGRATION_MARKER"
}

# =============================================================================
# Phases
# =============================================================================

# ---- phase_self_check --------------------------------------------------------
# Verify that the destinclaude-core package is present and structurally valid.
# Requirements (kept intentionally minimal — the app owns higher-level health):
#   - node is on PATH (migrations + helpers need it)
#   - TOOLKIT_ROOT exists
#   - VERSION file exists inside TOOLKIT_ROOT
#   - essential subdirs (hooks/) are present
phase_self_check() {
  emit_section "Self-Check"

  local passed=0 failed=0
  local node_ver

  if node_ver="$(node --version 2>/dev/null)"; then
    emit "OK" "node" "found (${node_ver})"
    passed=$((passed + 1))
  else
    emit "FAIL" "node" "not found — node is required"
    failed=$((failed + 1))
  fi

  if [ -d "$TOOLKIT_ROOT" ]; then
    emit "OK" "toolkit_root" "$TOOLKIT_ROOT"
    passed=$((passed + 1))
  else
    emit "FAIL" "toolkit_root" "missing: $TOOLKIT_ROOT"
    failed=$((failed + 1))
  fi

  if [ -f "$TOOLKIT_ROOT/VERSION" ]; then
    emit "OK" "VERSION" "$(read_current_version)"
    passed=$((passed + 1))
  else
    emit "FAIL" "VERSION" "missing: $TOOLKIT_ROOT/VERSION"
    failed=$((failed + 1))
  fi

  # Essential subdirs — the flat package ships hooks/ alongside skills/ commands/
  local d
  for d in hooks skills commands; do
    if [ -d "$TOOLKIT_ROOT/$d" ]; then
      emit "OK" "$d/" "present"
      passed=$((passed + 1))
    else
      emit "FAIL" "$d/" "missing: $TOOLKIT_ROOT/$d"
      failed=$((failed + 1))
    fi
  done

  emit_summary "${passed} checks passed, ${failed} failed"
  [ "$failed" -eq 0 ]
}

# ---- phase_migrations --------------------------------------------------------
# Run version-specific data migrations. Each migration is a .sh file named
# after the target version (e.g., 3.1.0.sh) under $TOOLKIT_ROOT/scripts/migrations/.
# A migration is applied if its version is strictly greater than the last
# migrated version and less than or equal to the current VERSION.
phase_migrations() {
  emit_section "Migrations"

  local current_ver from_ver
  current_ver="$(read_current_version)"
  if [ -z "$current_ver" ]; then
    emit "SKIP" "migrations" "no VERSION file — cannot compute migration range"
    return 0
  fi

  from_ver="$(read_last_migrated)"
  # First run after decomposition: treat unknown baseline as 0.0.0 so every
  # migration runs once, then the marker pins subsequent runs.
  [ -z "$from_ver" ] && from_ver="0.0.0"

  if [ "$from_ver" = "$current_ver" ]; then
    emit "OK" "migrations" "up to date (${current_ver})"
    return 0
  fi

  local migrations_dir="$TOOLKIT_ROOT/scripts/migrations"
  if [ ! -d "$migrations_dir" ]; then
    emit "INFO" "migrations" "no migrations dir (${from_ver} -> ${current_ver})"
    write_last_migrated "$current_ver"
    return 0
  fi

  # Collect applicable migration versions.
  local applicable="" f fname
  for f in "$migrations_dir"/*.sh; do
    [ -f "$f" ] || continue
    fname="$(basename "$f" .sh)"
    if version_gt "$fname" "$from_ver" && ! version_gt "$fname" "$current_ver"; then
      applicable="${applicable}${fname}
"
    fi
  done

  if [ -z "$applicable" ]; then
    emit "OK" "migrations" "none applicable (${from_ver} -> ${current_ver})"
    write_last_migrated "$current_ver"
    return 0
  fi

  # Sort and execute in ascending version order.
  local sorted version
  sorted="$(printf '%s' "$applicable" | sort -t. -k1,1n -k2,2n -k3,3n)"
  export TOOLKIT_ROOT CLAUDE_HOME PLATFORM

  while IFS= read -r version; do
    [ -z "$version" ] && continue
    emit_section "Migration ${version}"
    bash "$migrations_dir/${version}.sh"
  done <<EOF
$sorted
EOF

  write_last_migrated "$current_ver"
  emit_summary "migrations applied through ${current_ver}"
}

# ---- phase_verify ------------------------------------------------------------
# Confirm that every hook script settings.json references actually exists on
# disk. Under the decomposed layout, hooks live at
#   ~/.claude/plugins/destinclaude-core/hooks/
# and settings.json commands point at those absolute paths. We don't rewrite
# settings here (the app owns that); we just flag drift.
phase_verify() {
  emit_section "Verify: Hook Scripts"

  local settings="$CLAUDE_HOME/settings.json"
  local ok=0 fail=0

  if [ ! -f "$settings" ]; then
    emit "FAIL" "settings.json" "not found: $settings"
    return 1
  fi

  local node_settings
  node_settings="$(to_node_path "$settings")"

  # Ask node to enumerate every hook command across every trigger. Output is
  # tab-separated: <trigger>\t<command>. We then resolve each command to a
  # filesystem path and stat it.
  local node_output
  node_output="$(node -e "
    var fs = require('fs');
    var s = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    var hooks = s.hooks || {};
    Object.keys(hooks).forEach(function(trigger) {
      (hooks[trigger] || []).forEach(function(entry) {
        (entry.hooks || []).forEach(function(h) {
          if (h && h.command) console.log(trigger + '\t' + h.command);
        });
      });
    });
    if (s.statusLine && s.statusLine.command) {
      console.log('statusLine\t' + s.statusLine.command);
    }
  " "$node_settings" 2>/dev/null)" || {
    emit "FAIL" "settings.json" "could not parse"
    return 1
  }

  local line trigger command path_candidate
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    trigger="$(printf '%s' "$line" | cut -f1)"
    command="$(printf '%s' "$line" | cut -f2)"

    # Hook command is usually "bash /abs/path/script.sh" or just a path.
    # Take the last whitespace-separated token as the candidate file.
    path_candidate="$(printf '%s' "$command" | awk '{print $NF}')"

    if [ -f "$path_candidate" ] || [ -L "$path_candidate" ]; then
      emit "OK" "$trigger" "$(basename "$path_candidate")"
      ok=$((ok + 1))
    else
      emit "FAIL" "$trigger" "missing file: $path_candidate"
      fail=$((fail + 1))
    fi
  done <<EOF
$node_output
EOF

  emit_summary "${ok} OK, ${fail} FAIL"
  [ "$fail" -eq 0 ]
}

# ---- phase_post_update -------------------------------------------------------
# Composite phase run by the post-merge git hook. Dispatches the three
# surviving phases in order and aggregates exit status.
phase_post_update() {
  local overall=0

  phase_self_check || overall=1
  echo ""

  phase_migrations || overall=1
  echo ""

  phase_verify || overall=1

  return $overall
}

# =============================================================================
# Main dispatcher
# =============================================================================

main() {
  detect_platform

  local phase="${1:-}"
  case "$phase" in
    self-check)   phase_self_check ;;
    migrations)   phase_migrations ;;
    verify)       phase_verify ;;
    post-update)  phase_post_update ;;
    *)
      emit "FAIL" "unknown phase: ${phase}" "use: self-check|migrations|verify|post-update"
      exit 2
      ;;
  esac
}

main "$@"
