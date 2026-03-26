---
description: Download and install the latest DestinCode desktop app from GitHub Releases
---

Always downloads and installs the latest DestinCode desktop app from GitHub Releases. No version comparison — just get the latest and install it.

## Steps

1. **Detect toolkit root.**
   ```bash
   TOOLKIT_ROOT="$HOME/destinclaude"
   [[ ! -f "$TOOLKIT_ROOT/VERSION" ]] && TOOLKIT_ROOT=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.env.HOME+'/.claude/toolkit-state/config.json','utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" 2>/dev/null)
   ```
   If neither works: "Can't find toolkit root. Run `/setup-wizard` first."

2. **Check prerequisites.** Verify `gh` CLI is available:
   ```bash
   command -v gh &>/dev/null && echo "OK" || echo "MISSING"
   ```
   If missing: "The `gh` CLI is required. Install with `winget install GitHub.cli` (Windows), `brew install gh` (macOS), or see https://cli.github.com/."

3. **Fetch latest release version from GitHub.**
   ```bash
   gh release view --repo itsdestin/destinclaude --json tagName --jq '.tagName' 2>/dev/null
   ```
   Store as `LATEST_TAG` (e.g., `v2.1.4`). Strip `v` prefix as `LATEST_VERSION`.

   If this fails: "Can't reach GitHub — you may be offline."

4. **Verify install script exists.**
   ```bash
   [[ -f "$TOOLKIT_ROOT/desktop/scripts/install-app.sh" ]] && echo "OK" || echo "MISSING"
   ```
   If missing: "Install script not found. Your toolkit may not include the desktop component."

5. **Run the installer.** No confirmation needed — just install:
   ```bash
   TOOLKIT_ROOT="$TOOLKIT_ROOT" bash "$TOOLKIT_ROOT/desktop/scripts/install-app.sh" --version "$LATEST_VERSION"
   ```
   Present the installer output to the user.

6. **Launch the app** based on platform:
   ```bash
   # Windows
   "$LOCALAPPDATA/Programs/DestinCode/DestinCode.exe" &

   # macOS
   open /Applications/DestinCode.app

   # Linux
   ~/.local/bin/DestinCode.AppImage &
   ```

7. **Final confirmation.**
   ```
   DestinCode vX.Y.Z installed and launched.
   ```
