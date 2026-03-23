#!/usr/bin/env bash
# install-app.sh — Downloads and installs the DestinCode desktop app
# from GitHub Releases. Called by the setup wizard and /update.
#
# Usage: bash install-app.sh [--version X.Y.Z] [--unattended]
#
# Requires: curl or gh CLI

set -e

REPO="itsdestin/destinclaude"
TOOLKIT_ROOT="${TOOLKIT_ROOT:-$HOME/.claude/plugins/destinclaude}"
VERSION=""
UNATTENDED=false

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --unattended) UNATTENDED=true; shift ;;
    *) shift ;;
  esac
done

# Default version from VERSION file
if [[ -z "$VERSION" ]]; then
  VERSION=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null || echo "")
fi

if [[ -z "$VERSION" ]]; then
  echo "ERROR: Could not determine version. Pass --version X.Y.Z" >&2
  exit 1
fi

TAG="v$VERSION"

# Detect platform
detect_platform() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    Darwin)               echo "macos" ;;
    Linux)                echo "linux" ;;
    *)                    echo "unknown" ;;
  esac
}

PLATFORM=$(detect_platform)

if [[ "$PLATFORM" == "unknown" ]]; then
  echo "ERROR: Unsupported platform: $(uname -s)" >&2
  exit 1
fi

echo ""
echo "  Installing DestinCode $TAG for $PLATFORM..."

# Create temp directory
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Download the right binary
download() {
  local pattern="$1"

  # Try gh CLI first (handles auth, cleaner)
  if command -v gh &>/dev/null; then
    gh release download "$TAG" --repo "$REPO" --pattern "$pattern" --dir "$WORK_DIR" 2>/dev/null
    return $?
  fi

  # Fall back to curl via GitHub API
  local asset_url
  asset_url=$(curl -sL "https://api.github.com/repos/$REPO/releases/tags/$TAG" \
    | grep -o "\"browser_download_url\": *\"[^\"]*${pattern}[^\"]*\"" \
    | head -1 \
    | cut -d'"' -f4)

  if [[ -z "$asset_url" ]]; then
    echo "ERROR: Could not find $pattern in release $TAG" >&2
    return 1
  fi

  curl -sL -o "$WORK_DIR/$(basename "$asset_url")" "$asset_url"
}

case "$PLATFORM" in
  windows)
    echo "  Downloading installer..."
    download "*.exe"
    INSTALLER=$(find "$WORK_DIR" -name "*.exe" | head -1)
    if [[ -z "$INSTALLER" ]]; then
      echo "ERROR: No .exe found in release $TAG" >&2
      exit 1
    fi

    echo "  Running installer..."
    # NSIS installer — /S for silent, creates Start Menu shortcuts automatically
    "$INSTALLER" /S

    echo ""
    echo "  DestinCode installed!"
    echo "  - Start Menu shortcut created automatically"
    echo "  - Launch from Start Menu or search for 'DestinCode'"
    ;;

  macos)
    echo "  Downloading disk image..."
    download "*.dmg"
    DMG=$(find "$WORK_DIR" -name "*.dmg" | head -1)
    if [[ -z "$DMG" ]]; then
      echo "ERROR: No .dmg found in release $TAG" >&2
      exit 1
    fi

    echo "  Installing to /Applications..."
    hdiutil attach "$DMG" -quiet -nobrowse -mountpoint "$WORK_DIR/mnt"
    cp -R "$WORK_DIR/mnt/"*.app /Applications/
    hdiutil detach "$WORK_DIR/mnt" -quiet

    echo ""
    echo "  DestinCode installed to /Applications!"
    echo "  - Launch from Spotlight (Cmd+Space → 'DestinCode')"
    echo "  - Or open /Applications/DestinCode.app"
    echo ""
    echo "  Note: On first launch, right-click → Open to bypass Gatekeeper."
    ;;

  linux)
    echo "  Downloading AppImage..."
    download "*.AppImage"
    APPIMAGE=$(find "$WORK_DIR" -name "*.AppImage" | head -1)
    if [[ -z "$APPIMAGE" ]]; then
      echo "ERROR: No .AppImage found in release $TAG" >&2
      exit 1
    fi

    # Install to ~/.local/bin
    mkdir -p "$HOME/.local/bin"
    cp "$APPIMAGE" "$HOME/.local/bin/DestinCode.AppImage"
    chmod +x "$HOME/.local/bin/DestinCode.AppImage"

    # Create .desktop file for app launcher
    mkdir -p "$HOME/.local/share/applications"
    cat > "$HOME/.local/share/applications/destincode.desktop" << DESKTOP
[Desktop Entry]
Name=DestinCode
Comment=Desktop GUI for Claude Code with DestinClaude
Exec=$HOME/.local/bin/DestinCode.AppImage
Icon=$TOOLKIT_ROOT/desktop/assets/icon.png
Type=Application
Categories=Development;
DESKTOP

    echo ""
    echo "  DestinCode installed!"
    echo "  - Added to app launcher"
    echo "  - Or run: ~/.local/bin/DestinCode.AppImage"
    ;;
esac

echo ""
