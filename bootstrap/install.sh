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
    # Developer Mode is required for symlinks on Windows — no fallback to copies.
    DEV_MODE=$(reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense 2>/dev/null | grep -o "0x1" || true)
    if [[ -z "$DEV_MODE" ]]; then
        echo "  Developer Mode is required but not enabled."
        echo "  Attempting to enable it now (you may see a permission prompt)..."
        echo ""
        if powershell.exe -Command "Start-Process powershell -ArgumentList '-Command','Set-ItemProperty -Path HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock -Name AllowDevelopmentWithoutDevLicense -Value 1 -Type DWord' -Verb RunAs -Wait" 2>/dev/null; then
            # Verify it worked
            DEV_MODE=$(reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense 2>/dev/null | grep -o "0x1" || true)
            if [[ -z "$DEV_MODE" ]]; then
                # Also check via PowerShell (reg query can miss it on some systems)
                DEV_MODE=$(powershell.exe -Command "(Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock' -Name 'AllowDevelopmentWithoutDevLicense' -ErrorAction SilentlyContinue).AllowDevelopmentWithoutDevLicense" 2>/dev/null | tr -d '\r')
                [[ "$DEV_MODE" != "1" ]] && DEV_MODE=""
            fi
        fi
        if [[ -z "$DEV_MODE" ]]; then
            echo ""
            echo "  ERROR: Could not enable Developer Mode."
            echo ""
            echo "  Developer Mode is required for symlinks, which DestinClaude"
            echo "  depends on. Please enable it manually:"
            echo ""
            echo "    Settings > System > For Developers > Developer Mode"
            echo ""
            echo "  Or use the PowerShell installer which handles this automatically:"
            echo "    powershell -ExecutionPolicy Bypass -File install.ps1"
            echo ""
            exit 1
        fi
        echo "  Developer Mode enabled"
    else
        echo "  Developer Mode enabled"
    fi

    # MSYS/Git Bash requires this env var to create real Windows symlinks
    export MSYS=winsymlinks:nativestrict
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
    echo "  Installing git..."
    if [[ "$OS" == "macos" ]]; then
        brew install git
    elif [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y git
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y git
        else
            echo ""
            echo "  Please install git using your distro's package manager."
            exit 1
        fi
    else
        echo ""
        echo "  Please install git manually, then re-run this script."
        exit 1
    fi
    if ! command -v git &> /dev/null; then
        echo ""
        echo "  Git installation didn't seem to take effect in this session."
        echo "  Close this terminal, open a new one, and re-run this script."
        exit 1
    fi
    echo "  Git installed: $(git --version | head -1)"
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
    echo "  Updating toolkit..."
    if git -C "$TOOLKIT_DIR" pull --ff-only 2>/dev/null; then
        echo "  Toolkit updated"
    else
        echo "  Toolkit update skipped (local changes present)"
    fi
else
    echo "  Cloning toolkit..."
    mkdir -p "$HOME/.claude/plugins"
    git clone https://github.com/itsdestin/destinclaude.git "$TOOLKIT_DIR"
    echo "  Toolkit cloned"
fi

# --- Register /setup command and wizard skill ---
# Claude Code auto-discovers commands from ~/.claude/commands/ and skills
# from ~/.claude/skills/. Symlink the setup wizard into these standard
# locations so /setup works immediately — no plugin registration needed.
echo "  Registering setup wizard..."
mkdir -p "$HOME/.claude/commands" "$HOME/.claude/skills"

# Remove any stale symlinks/copies before creating new ones
rm -f "$HOME/.claude/commands/setup.md" 2>/dev/null
rm -f "$HOME/.claude/commands/setup-wizard.md" 2>/dev/null
# rm -f won't remove a directory symlink on some systems; use explicit check
if [ -L "$HOME/.claude/skills/setup-wizard" ]; then
    rm "$HOME/.claude/skills/setup-wizard"
elif [ -d "$HOME/.claude/skills/setup-wizard" ]; then
    rm -rf "$HOME/.claude/skills/setup-wizard"
fi

# Use the core skill directly (not the root-level copy) to avoid symlink chains
ln -sf "$TOOLKIT_DIR/core/commands/setup-wizard.md" "$HOME/.claude/commands/setup-wizard.md"
ln -sf "$TOOLKIT_DIR/core/skills/setup-wizard" "$HOME/.claude/skills/setup-wizard"

# Verify symlinks resolve correctly
SETUP_OK=true
if [ ! -e "$HOME/.claude/commands/setup-wizard.md" ]; then
    echo "  WARNING: /setup command symlink is broken"
    SETUP_OK=false
fi
if [ ! -e "$HOME/.claude/skills/setup-wizard/SKILL.md" ]; then
    echo "  WARNING: setup-wizard skill symlink is broken"
    SETUP_OK=false
fi

if [ "$SETUP_OK" = true ]; then
    echo "  Setup wizard registered"
else
    echo ""
    echo "  ERROR: Symlink creation failed."
    if [[ "$OS" == "windows" ]]; then
        echo "  On Windows, ensure Developer Mode is enabled and you're"
        echo "  running Git Bash (not cmd.exe or PowerShell)."
        echo ""
        echo "  Or use the PowerShell installer instead:"
        echo "    powershell -ExecutionPolicy Bypass -File install.ps1"
    else
        echo "  Check filesystem permissions and try again."
    fi
    exit 1
fi

echo ""
echo ""
echo ""

# Launch Claude and kick off the setup wizard automatically.
# If stdout is a terminal we can start an interactive session right here.
# curl|bash sets stdin to a pipe, so redirect from /dev/tty so Claude can
# still receive keyboard input even in that case.
if [ -t 1 ]; then
    echo "  ====================================================="
    echo "  |                                                   |"
    echo "  |   Download complete! Starting setup...            |"
    echo "  |                                                   |"
    echo "  ====================================================="
    echo ""
    claude "set me up" < /dev/tty
else
    echo "  ====================================================="
    echo "  |                                                   |"
    echo "  |   Download complete!                              |"
    echo "  |                                                   |"
    echo "  |   Open a new terminal and run:                    |"
    echo "  |     claude                                        |"
    echo "  |   Then say: \"set me up\"                           |"
    echo "  |                                                   |"
    echo "  ====================================================="
    echo ""
fi
