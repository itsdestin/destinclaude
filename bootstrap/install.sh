#!/bin/bash
# DestinClaude Bootstrap Installer — macOS / Linux
# Downloads prerequisites and clones the toolkit so Claude Code can finish setup.
set -e

# When run via `curl | bash`, stdin is the pipe — not the keyboard.
# We use /dev/tty for interactive reads so prompts still work.
# (We do NOT use `exec < /dev/tty` because that kills the curl pipe.)

echo "==================================="
echo "  DestinClaude Installer"
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
    read -p "Continue in bash? (y/N) " -n 1 -r < /dev/tty
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0
fi

# --- Check for Homebrew (macOS only) ---
if [[ "$OS" == "macos" ]]; then
    if command -v brew &> /dev/null; then
        echo "  Homebrew found: $(brew --version | head -1)"
    else
        echo ""
        echo "  Installing Homebrew (the Mac package manager)..."
        echo "  This is used to install everything else — Node.js, git tools,"
        echo "  Google Cloud SDK, and more."
        echo ""
        echo "  (If asked for your password, nothing will appear as you type"
        echo "   — that's normal. Just type it and press Enter.)"
        echo ""
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Homebrew on Apple Silicon installs to /opt/homebrew
        if [[ -f /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [[ -f /usr/local/bin/brew ]]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        if command -v brew &> /dev/null; then
            echo "  Homebrew installed"
        else
            echo ""
            echo "  Homebrew installation didn't take effect in this session."
            echo "  Close this terminal, open a new one, and re-run this script."
            exit 1
        fi
    fi
fi

# --- Check for Node.js ---
if command -v node &> /dev/null; then
    echo "  Node.js found: $(node --version)"
else
    echo "  Installing Node.js..."
    if [[ "$OS" == "macos" ]]; then
        brew install node
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            echo "  (If asked for your password, nothing will appear as you type"
            echo "   — that's normal. Just type it and press Enter.)"
            curl -fsSL https://deb.nodesource.com/setup-wizard_lts.x | sudo -E bash -
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
    if ! command -v node &> /dev/null; then
        echo ""
        echo "  Node.js installation didn't seem to take effect in this session."
        echo "  Close this terminal, open a new one, and re-run this script."
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
TOOLKIT_DIR="$HOME/.claude/plugins/destinclaude"
if [ -d "$TOOLKIT_DIR" ]; then
    echo "  Toolkit already cloned at $TOOLKIT_DIR"
else
    echo "  Cloning toolkit..."
    mkdir -p "$HOME/.claude/plugins"
    git clone https://github.com/itsdestin/destinclaude.git "$TOOLKIT_DIR"
    echo "  Toolkit cloned"
fi

# --- Register /setup-wizard command and wizard skill ---
# Claude Code auto-discovers commands from ~/.claude/commands/ and skills
# from ~/.claude/skills/. Symlink the setup wizard into these standard
# locations so /setup-wizard works immediately — no plugin registration needed.
echo "  Registering setup wizard..."
mkdir -p "$HOME/.claude/commands" "$HOME/.claude/skills"

# Remove any stale symlinks/copies before creating new ones
rm -f "$HOME/.claude/commands/setup-wizard.md" 2>/dev/null
# rm -f won't remove a directory symlink on some systems; use explicit check
if [ -L "$HOME/.claude/skills/setup-wizard-wizard" ]; then
    rm "$HOME/.claude/skills/setup-wizard-wizard"
elif [ -d "$HOME/.claude/skills/setup-wizard-wizard" ]; then
    rm -rf "$HOME/.claude/skills/setup-wizard-wizard"
fi

# Use the core skill directly (not the root-level copy) to avoid symlink chains
ln -sf "$TOOLKIT_DIR/core/commands/setup-wizard.md" "$HOME/.claude/commands/setup-wizard.md"
ln -sf "$TOOLKIT_DIR/core/skills/setup-wizard-wizard" "$HOME/.claude/skills/setup-wizard-wizard"

# Verify symlinks resolve correctly
SETUP_OK=true
if [ ! -e "$HOME/.claude/commands/setup-wizard.md" ]; then
    echo "  WARNING: /setup-wizard command symlink is broken"
    SETUP_OK=false
fi
if [ ! -e "$HOME/.claude/skills/setup-wizard-wizard/SKILL.md" ]; then
    echo "  WARNING: setup-wizard skill symlink is broken"
    SETUP_OK=false
fi

if [ "$SETUP_OK" = true ]; then
    echo "  Setup wizard registered"
else
    echo ""
    echo "  Symlink creation failed. Falling back to copy..."
    cp "$TOOLKIT_DIR/core/commands/setup-wizard.md" "$HOME/.claude/commands/setup-wizard.md"
    cp -R "$TOOLKIT_DIR/core/skills/setup-wizard-wizard" "$HOME/.claude/skills/setup-wizard-wizard"
    echo "  Setup wizard registered (copied)"
fi

echo ""
echo ""
echo ""
echo "  ========================================"
echo "  |                                      |"
echo "  |   Installation complete!             |"
echo "  |                                      |"
echo "  |   Now run these two commands:        |"
echo "  |                                      |"
echo "  |     1.  claude                       |"
echo "  |     2.  /setup-wizard                       |"
echo "  |                                      |"
echo "  ========================================"
echo ""
