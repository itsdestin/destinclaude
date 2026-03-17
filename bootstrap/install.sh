#!/bin/bash
# ClaudifestDestiny Bootstrap Installer — macOS / Linux
# Downloads prerequisites and clones the toolkit so Claude Code can finish setup.
set -e

# When run via `curl | bash`, stdin is the pipe — not the keyboard.
# We use /dev/tty for interactive reads so prompts still work.
# (We do NOT use `exec < /dev/tty` because that kills the curl pipe.)

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
    read -p "Continue in bash? (y/N) " -n 1 -r < /dev/tty
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
            echo "  Node.js is required. How would you like to install it?"
            echo ""
            echo "  1) Download Node.js directly (simplest — just installs Node)"
            echo "  2) Install Homebrew first, then use it for Node"
            echo "     (Homebrew is a package manager — handy if you plan to"
            echo "      install other developer tools later)"
            echo ""
            read -p "  Choose 1 or 2: " -n 1 -r < /dev/tty
            echo ""
            if [[ "$REPLY" == "2" ]]; then
                echo ""
                echo "  Installing Homebrew..."
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
                echo "  Installing Node.js via Homebrew..."
                brew install node
            else
                echo ""
                echo "  Downloading Node.js installer..."
                ARCH="$(uname -m)"
                if [[ "$ARCH" == "arm64" ]]; then
                    NODE_PKG_URL="https://nodejs.org/dist/v22.15.0/node-v22.15.0.pkg"
                else
                    NODE_PKG_URL="https://nodejs.org/dist/v22.15.0/node-v22.15.0.pkg"
                fi
                curl -fSL -o /tmp/node-installer.pkg "$NODE_PKG_URL"
                echo "  Running Node.js installer..."
                echo "  (Your Mac will ask for your password. When you type it,"
                echo "   nothing will appear on screen — that's normal. Just type"
                echo "   it and press Enter.)"
                echo ""
                sudo installer -pkg /tmp/node-installer.pkg -target /
                rm -f /tmp/node-installer.pkg
            fi
            if ! command -v node &> /dev/null; then
                echo ""
                echo "  Node.js installation didn't seem to take effect in this session."
                echo "  Close this terminal, open a new one, and re-run this script."
                exit 1
            fi
        fi
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            echo "  Using apt to install Node.js..."
            echo "  (If asked for your password, nothing will appear as you type"
            echo "   — that's normal. Just type it and press Enter.)"
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

# --- Register /setup command and wizard skill ---
# Claude Code auto-discovers commands from ~/.claude/commands/ and skills
# from ~/.claude/skills/. Symlink the setup wizard into these standard
# locations so /setup works immediately — no plugin registration needed.
echo "  Registering setup wizard..."
mkdir -p "$HOME/.claude/commands" "$HOME/.claude/skills"
ln -sf "$TOOLKIT_DIR/commands/setup.md" "$HOME/.claude/commands/setup.md"
ln -sf "$TOOLKIT_DIR/skills/setup-wizard" "$HOME/.claude/skills/setup-wizard"
echo "  Setup wizard registered"

echo ""
echo "==================================="
echo "  Ready!"
echo "==================================="
echo ""
echo "Next steps:"
echo "  1. Open a terminal (or stay in this one)"
echo "  2. Type: claude"
echo "  3. Type: /setup"
echo ""
echo "The /setup command launches the setup wizard, which walks you"
echo "through choosing what to install, personalizing your setup,"
echo "and verifying everything works."
echo ""
