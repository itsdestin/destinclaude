#!/bin/bash
# Scans all files in a directory for personal/sensitive content
# Usage: bash security-sweep.sh <directory>
# Requires: bash (runs in Git Bash on Windows, native bash on macOS/Linux)
# Report-only mode — lists all matches for manual review.

PATTERNS_FILE="$(dirname "$0")/security-patterns.txt"
TARGET_DIR="${1:-.}"

# Read patterns, skip comments and blanks
patterns=()
while IFS= read -r line; do
    line="${line//$'\r'/}"  # Strip Windows carriage returns
    [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
    patterns+=("$line")
done < "$PATTERNS_FILE"

found=0
for pattern in "${patterns[@]}"; do
    matches=$(grep -rn "$pattern" "$TARGET_DIR" \
        --include="*.sh" --include="*.md" --include="*.json" \
        --include="*.py" --include="*.go" --include="*.js" \
        --include="*.yaml" --include="*.yml" --include="*.txt" \
        2>/dev/null)
    if [[ -n "$matches" ]]; then
        echo "=== Pattern: $pattern ==="
        echo "$matches"
        echo ""
        found=$((found + 1))
    fi
done

if [[ $found -eq 0 ]]; then
    echo "✅ No sensitive patterns found."
else
    echo "❌ Found $found pattern categories with matches."
fi
