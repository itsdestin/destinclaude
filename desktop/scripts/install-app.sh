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
trap '[[ -n "$WORK_DIR" ]] && rm -rf "$WORK_DIR"' EXIT

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

# Close running DestinCode instances
close_running_app() {
  case "$PLATFORM" in
    windows)
      # taskkill returns non-zero if process not found — that's fine
      taskkill //IM "DestinCode.exe" //F 2>/dev/null || true
      sleep 1
      ;;
    macos)
      if pgrep -x "DestinCode" >/dev/null 2>&1; then
        echo "  Closing running DestinCode..."
        osascript -e 'tell application "DestinCode" to quit' 2>/dev/null || true
        # Wait up to 5s for graceful quit
        for i in 1 2 3 4 5; do
          pgrep -x "DestinCode" >/dev/null 2>&1 || break
          sleep 1
        done
        # Force kill if still running
        pkill -9 -x "DestinCode" 2>/dev/null || true
      fi
      ;;
    linux)
      pkill -f "DestinCode.AppImage" 2>/dev/null || true
      sleep 1
      ;;
  esac
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

    # Close running app so the installer can replace files
    close_running_app

    # Uninstall previous version to avoid NSIS same-version skip.
    # electron-builder installs to $LOCALAPPDATA/Programs/DestinCode
    UNINSTALLER="$LOCALAPPDATA/Programs/DestinCode/Uninstall DestinCode.exe"
    if [[ -f "$UNINSTALLER" ]]; then
      echo "  Removing previous version..."
      "$UNINSTALLER" /S 2>/dev/null || true
      # Wait for uninstaller to finish
      sleep 3
    fi

    echo "  Running installer..."
    # NSIS installer — /S for silent, creates Start Menu shortcuts automatically
    "$INSTALLER" /S

    # NSIS /S forks to background on Windows — wait for it to finish
    sleep 5

    echo ""
    echo "  DestinCode $TAG installed!"
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

    # Close running app so we can replace the .app bundle
    close_running_app

    echo "  Installing to /Applications..."
    hdiutil attach "$DMG" -quiet -nobrowse -mountpoint "$WORK_DIR/mnt"
    # Remove old app first to avoid cp -R failing on locked files
    rm -rf /Applications/DestinCode.app
    cp -R "$WORK_DIR/mnt/"*.app /Applications/
    hdiutil detach "$WORK_DIR/mnt" -quiet

    echo ""
    echo "  DestinCode $TAG installed to /Applications!"
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

    # Close running app before replacing the binary
    close_running_app

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
    echo "  DestinCode $TAG installed!"
    echo "  - Added to app launcher"
    echo "  - Or run: ~/.local/bin/DestinCode.AppImage"
    ;;
esac

# Post-install verification
echo ""
case "$PLATFORM" in
  windows)
    if [[ -d "$LOCALAPPDATA/Programs/DestinCode" ]]; then
      echo "  Verified: DestinCode installed at $LOCALAPPDATA/Programs/DestinCode"
    else
      echo "  WARNING: Installation directory not found. The installer may still be running." >&2
      echo "  Check Start Menu for DestinCode in a few seconds." >&2
    fi
    ;;
  macos)
    if [[ -d "/Applications/DestinCode.app" ]]; then
      echo "  Verified: /Applications/DestinCode.app exists"
    else
      echo "  WARNING: /Applications/DestinCode.app not found after install." >&2
    fi
    ;;
  linux)
    if [[ -x "$HOME/.local/bin/DestinCode.AppImage" ]]; then
      echo "  Verified: ~/.local/bin/DestinCode.AppImage exists and is executable"
    else
      echo "  WARNING: AppImage not found or not executable after install." >&2
    fi
    ;;
esac
echo ""
