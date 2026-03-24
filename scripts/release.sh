#!/usr/bin/env bash
# Release script — bumps VERSION + plugin.json, adds CHANGELOG header, commits, tags, and pushes.
# Usage: ./scripts/release.sh 1.3.0
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="$1"
if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/release.sh <version>"
    echo "  e.g. ./scripts/release.sh 1.3.0"
    exit 1
fi

# Strip leading v if provided
VERSION="${VERSION#v}"

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: '$VERSION' is not valid semver (expected X.Y.Z)"
    exit 1
fi

CURRENT=$(cat VERSION 2>/dev/null | tr -d '[:space:]')
# Portable semver comparison via node (sort -V is GNU-only, fails on macOS)
_IS_NEWER=$(node -e "const[a,b]=[process.argv[1],process.argv[2]].map(v=>v.split('.').map(Number));console.log((a[0]-b[0]||a[1]-b[1]||a[2]-b[2])<0?'yes':'no')" "$CURRENT" "$VERSION" 2>/dev/null) || _IS_NEWER="no"
if [[ "$_IS_NEWER" != "yes" ]]; then
    echo "Error: v$VERSION is not newer than current v$CURRENT"
    exit 1
fi

# Check for existing tag
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo "Error: tag v$VERSION already exists"
    exit 1
fi

# Check working tree is clean (besides what we're about to change)
if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: working tree is dirty — commit or stash changes first"
    exit 1
fi

echo "Releasing v$VERSION (currently v$CURRENT)"

# 1. Bump VERSION
echo "$VERSION" > VERSION

# 2. Bump plugin.json (portable: temp file instead of sed -i which differs on macOS)
sed "s/\"version\": \"$CURRENT\"/\"version\": \"$VERSION\"/" plugin.json > plugin.json.tmp && mv plugin.json.tmp plugin.json

# 3. Add CHANGELOG header (portable: awk instead of GNU-only sed 0,/ADDR/ syntax)
TODAY=$(date +%Y-%m-%d)
awk -v ver="$VERSION" -v today="$TODAY" 'BEGIN{done=0} /^## / && !done {printf "## v%s (%s)\n\n_(fill in release notes)_\n\n", ver, today; done=1} {print}' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

# 4. Commit, tag, push
git add VERSION plugin.json CHANGELOG.md
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin master --tags

echo ""
echo "Done — v$VERSION tagged and pushed."
echo "Remember to fill in the CHANGELOG entry."
