#!/bin/bash
# ClaudifestDestiny Bootstrap Installer — macOS / Linux
# Downloads prerequisites and clones the toolkit so Claude Code can finish setup.
set -e

echo "==================================="
echo "  ClaudifestDestiny Installer"
echo "==================================="
echo ""

# --- Detect OS ---
case "$(uname -s)" in
    Darwin*)  OS="macos" ;;
    Linux*)   OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
    *)        OS="unknown" ;;
esac

if [[ "$OS" == "windows" ]]; then
    echo "On Windows? Use the PowerShell installer instead:"
    echo "  powershell -ExecutionPolicy Bypass -File install.ps1"
    echo ""
    echo "Or if you're in Git Bash and want to continue, that works too."
    read -p "Continue in bash? (y/N) " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
fi

# --- Check for Node.js ---
if command -v node &> /dev/null; then
    echo "  Node.js found: $(node --version)"
else
    echo "  Installing Node.js..."
    if [[ "$OS" == "macos" ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo ""
            echo "  Node.js is required but Homebrew isn't installed."
            echo "  Option 1: Install Homebrew first — https://brew.sh"
            echo "  Option 2: Download Node.js directly — https://nodejs.org"
            echo ""
            echo "  Install Node.js, then re-run this script."
            exit 1
        fi
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            echo "  Using apt to install Node.js (may ask for your password)..."
            curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs
        else
            echo ""
            echo "  Please install Node.js from https://nodejs.org"
            exit 1
        fi
    else
        echo "  Please install Node.js from https://nodejs.org"
        exit 1
    fi
    echo "  Node.js installed: $(node --version)"
fi

# --- Check for git ---
if command -v git &> /dev/null; then
    echo "  Git found: $(git --version | head -1)"
else
    echo ""
    echo "  Git is required but not installed."
    if [[ "$OS" == "macos" ]]; then
        echo "  Run: xcode-select --install"
    elif [[ "$OS" == "linux" ]]; then
        echo "  Run: sudo apt install git  (or your distro's equivalent)"
    fi
    echo ""
    echo "  Install git, then re-run this script."
    exit 1
fi

# --- Check for Claude Code ---
if command -v claude &> /dev/null; then
    echo "  Claude Code found"
else
    echo "  Installing Claude Code..."
    npm install -g @anthropic-ai/claude-code
    if command -v claude &> /dev/null; then
        echo "  Claude Code installed"
    else
        echo ""
        echo "  Claude Code installation may need a new terminal session."
        echo "  Close this terminal, open a new one, and re-run this script."
        exit 1
    fi
fi

# --- Clone the toolkit ---
TOOLKIT_DIR="$HOME/.claude/plugins/claudifest-destiny"
if [ -d "$TOOLKIT_DIR" ]; then
    echo "  Toolkit already cloned at $TOOLKIT_DIR"
else
    echo "  Cloning toolkit..."
    mkdir -p "$HOME/.claude/plugins"
    git clone https://github.com/itsdestin/claudifest-destiny.git "$TOOLKIT_DIR"
    echo "  Toolkit cloned"
fi

echo ""
echo "==================================="
echo "  Ready!"
echo "==================================="
echo ""
echo "Next steps:"
echo "  1. Open a terminal (or stay in this one)"
echo "  2. Type: claude"
echo "  3. Say: set me up"
echo ""
echo "Claude will walk you through the rest — choosing what to"
echo "install, personalizing your setup, and verifying everything works."
echo ""
