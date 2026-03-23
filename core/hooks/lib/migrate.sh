#!/usr/bin/env bash
# migrate.sh — Backup schema migration runner
# Design ref: backup-system-refactor-design (03-22-2026).md D7
#
# Usage: source lib/migrate.sh; run_migrations <restore_dir>

# NOTE: Do not set shell options (set -euo pipefail) in sourced libraries.
# All callers already set these. Changing them here would affect the caller's
# error handling if they ever diverge.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"

CURRENT_SCHEMA_VERSION=1

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

write_backup_meta() {
    local target_dir="$1"
    local toolkit_version="unknown"
    if [[ -n "${TOOLKIT_ROOT:-}" && -f "$TOOLKIT_ROOT/VERSION" ]]; then
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

run_migrations() {
    local restore_dir="$1"
    local backup_version
    backup_version=$(get_backup_schema_version "$restore_dir")

    if [[ "$backup_version" -gt "$CURRENT_SCHEMA_VERSION" ]]; then
        log_backup "ERROR" "Backup schema v$backup_version is newer than toolkit's v$CURRENT_SCHEMA_VERSION. Run /update first."
        return 1
    fi

    if [[ "$backup_version" -eq "$CURRENT_SCHEMA_VERSION" ]]; then
        log_backup "INFO" "Backup schema v$backup_version matches current — no migration needed."
        return 0
    fi

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
