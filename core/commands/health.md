---
description: Quick health check — verify all toolkit components are working
---

Run a lightweight health check on the installed toolkit. This is the same verification from the setup wizard's Phase 6, but without reinstalling anything. Use this when the user wants to confirm everything is working, or after troubleshooting an issue.

## Steps

1. **Read config.** Load `~/.claude/toolkit-state/config.json` to determine which layers are installed and the `toolkit_root` path. If the file doesn't exist, infer from which skill symlinks exist in `~/.claude/skills/`.

2. **Detect platform.**
   ```bash
   case "$(uname -s)" in
     Darwin*)  echo "macos" ;;
     MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
     Linux*)   echo "linux" ;;
   esac
   ```

3. **Run checks.** For each installed layer, verify:

   **Core (always):**
   - [ ] `git --version` succeeds
   - [ ] Toolkit root directory exists and contains `VERSION`
   - [ ] `~/.claude/CLAUDE.md` exists and contains toolkit sections
   - [ ] All expected symlinks in `~/.claude/skills/` resolve (not broken)
   - [ ] All expected symlinks in `~/.claude/commands/` resolve (not broken)
   - [ ] Hooks are registered in `~/.claude/settings.json`
   - [ ] Statusline is configured in `~/.claude/settings.json`
   - [ ] `~/.claude/statusline.sh` exists and resolves

   **Life (if installed):**
   - [ ] `rclone lsd gdrive:` succeeds (Google Drive connected)
   - [ ] Encyclopedia files exist locally
   - [ ] Journal directory exists or can be created

   **Productivity (if installed):**
   - [ ] Todoist API responds (if token configured)
   - [ ] gmessages binary exists (if Google Messages was set up)
   - [ ] imessages server responds (if iMessage was set up, macOS only)

4. **MCP availability check.** Read `<toolkit_root>/core/mcp-manifest.json`. Load the registered MCP servers from `~/.claude.json` (under `mcpServers`). For each manifest entry:
   - Skip if `platform` doesn't match the current platform (skip `platform: "all"` entries that are `auto: false` — those require setup steps)
   - Skip if already registered in `~/.claude.json`
   - Otherwise: flag as **available but not registered**

   Show a summary:
   ```
   MCP Servers:
     macos-automator .............. NOT REGISTERED (available)
     home-mcp ..................... NOT REGISTERED (available)
     apple-events ................. OK
     imessages .................... OK
   ```

   If any `auto: true` MCPs are missing, offer: "I can register these now — want me to add them to `~/.claude.json`?"

   If the user says yes, for each missing `auto: true` MCP on the current platform:
   - Read the config from the manifest entry
   - Replace `{{toolkit_root}}` placeholders with the actual toolkit root path
   - Add to `~/.claude.json` under `mcpServers`, preserving all existing content
   - Confirm: "Registered: [name] — [description]"

   For `auto: false` MCPs that are missing, show: "[name] — [setup_note]. Run `/setup-wizard` to configure it."

5. **Report results.** Show a clean pass/fail summary:

   ```
   Toolkit Health Check

   Core:
     Git ................................. OK
     Toolkit root ........................ OK
     CLAUDE.md ........................... OK
     Skills linked ....................... OK
     Commands linked ..................... OK
     Hooks registered .................... OK
     Statusline .......................... OK

   Life:
     Google Drive ........................ OK
     Encyclopedia files .................. OK
     Journal directory ................... OK

   Productivity:
     Todoist ............................. OK
     Google Messages ..................... OK

   MCP Servers:
     [per manifest check above]
   ```

6. **If anything failed:** Show "These items need attention:" with specific, plain-English guidance on how to fix each one. Offer to fix automatically where possible. For issues that require re-running setup, suggest: "You can fix this by running `/setup-wizard` — it's safe to run again and won't change your existing settings."

7. **If everything passed:** Show: "Everything looks good! All [N] checks passed."
