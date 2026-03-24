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
   - [ ] On Windows: Developer Mode is enabled (check `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense`). If not enabled, show WARN with: "Developer Mode is off — symlinks won't work. Run the PowerShell installer or enable it in Settings > System > For Developers."
   - [ ] Toolkit root directory exists and contains `VERSION`
   - [ ] `~/.claude/CLAUDE.md` exists and contains toolkit sections
   - [ ] All expected symlinks in `~/.claude/skills/` resolve (not broken)
   - [ ] All expected symlinks in `~/.claude/commands/` resolve (not broken)
   - [ ] Hooks are registered in `~/.claude/settings.json`
   - [ ] Statusline is configured in `~/.claude/settings.json`
   - [ ] `~/.claude/statusline.sh` exists and resolves
   - [ ] All 13 marketplace plugins present in `~/.claude/settings.json` `enabledPlugins`
   - [ ] **Hook freshness:** For each hook in `~/.claude/hooks/` and `~/.claude/statusline.sh`, compare against the repo version in `<toolkit_root>/core/hooks/`. If any differ (stale copies from a previous version), show WARN with the stale file names and offer to refresh them. Also check that utility scripts (`announcement-fetch.js`, `usage-fetch.js`) are present in `~/.claude/hooks/`.
   - [ ] **Feature pipeline:** Verify the four statusline features work end-to-end:
     - Session naming: `title-update.sh` registered at `PostToolUse`, `~/.claude/topics/` directory exists
     - Announcements: `announcement-fetch.js` is reachable (via `toolkit_root` config or as sibling)
     - Version display: `~/.claude/toolkit-state/update-status.json` exists with valid JSON
     - Rate limits: `usage-fetch.js` is reachable from where `statusline.sh` runs
   - [ ] **Backend connectivity:** For each configured backend in `PERSONAL_SYNC_BACKEND` (comma-separated):
     - **Drive:** `rclone lsd gdrive: 2>/dev/null` succeeds
     - **GitHub:** `git ls-remote` on the personal-sync repo URL succeeds
     - **iCloud:** iCloud folder exists at the configured or auto-detected path
     If any backend is unreachable, show WARN (not FAIL — backends can be temporarily offline)
   - [ ] **Backup schema:** If `~/.claude/backup-meta.json` exists, verify `schema_version` matches the toolkit's expected version. If it doesn't match, show WARN: "Backup schema mismatch — run /restore to migrate"
   - [ ] **Shared libraries:** `~/.claude/hooks/lib/backup-common.sh` and `~/.claude/hooks/lib/migrate.sh` exist and resolve (if symlinks)
   - [ ] **Migrations directory:** `~/.claude/hooks/migrations/v1.json` exists

   **Life (if installed):**
   - [ ] `rclone lsd gdrive:` succeeds (Google Drive connected)
   - [ ] Encyclopedia files exist locally
   - [ ] Journal directory exists or can be created

   **Productivity (if installed):**
   - [ ] Todoist MCP responds (if configured)
   - [ ] gmessages binary exists (if Google Messages was set up)
   - [ ] imessages server responds (if iMessage was set up, macOS only)

4. **Marketplace plugin check.** Load `~/.claude/settings.json`. Check the `enabledPlugins` key. For each plugin in the canonical list below that is NOT already present, add it with value `true` and write the file back — no prompt needed.

   Canonical plugin list:
   ```
   superpowers@claude-plugins-official
   claude-md-management@claude-plugins-official
   code-review@claude-plugins-official
   code-simplifier@claude-plugins-official
   commit-commands@claude-plugins-official
   feature-dev@claude-plugins-official
   skill-creator@claude-plugins-official
   explanatory-output-style@claude-plugins-official
   learning-output-style@claude-plugins-official
   context7@claude-plugins-official
   linear@claude-plugins-official
   playwright@claude-plugins-official
   plugin-dev@claude-plugins-official
   ```

   In the health report, show each plugin as OK or ADDED:
   ```
   Marketplace Plugins:
     superpowers .......................... OK
     commit-commands ...................... ADDED
     ...
   ```

5. **MCP availability check.** Read `<toolkit_root>/core/mcp-manifest.json`. Load the registered MCP servers from `~/.claude.json` (under `mcpServers`). For each manifest entry:
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

6. **Plugin dependency check.** Scan all installed marketplace plugins and toolkit hooks for external runtime dependencies (executables they call). For each dependency, verify it's available on the system.
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" deps
    ```
    Show results in the report. For any `[MISSING]` items:
    - Explain which plugin/hook needs it and what events are affected
    - Explain the symptom: "You'll see 'hook error' messages on every [event] until this is installed"
    - Show the install command from the `[FIX]` lines
    - Offer to install automatically (via winget/brew/apt depending on platform)

    For `[OK]` items, show them in the summary table.

7. **Report results.** Show a clean pass/fail summary:

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

   Marketplace Plugins:
     [per step 4 above]

   MCP Servers:
     [per step 5 above]

   Plugin Dependencies:
     [per step 6 above]
   ```

8. **If anything failed:** Show "These items need attention:" with specific, plain-English guidance on how to fix each one. Offer to fix automatically where possible. For issues that require re-running setup, suggest: "You can fix this by running `/setup-wizard` — it's safe to run again and won't change your existing settings."

9. **If everything passed:** Show: "Everything looks good! All [N] checks passed."
