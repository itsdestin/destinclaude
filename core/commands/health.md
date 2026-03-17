---
description: Quick health check — verify all toolkit components are working
---

Run a lightweight health check on the installed toolkit. This is the same verification from the setup wizard's Phase 6, but without reinstalling anything. Use this when the user wants to confirm everything is working, or after troubleshooting an issue.

## Steps

1. **Read config.** Load `~/.claude/toolkit-state/config.json` to determine which layers are installed. If the file doesn't exist, infer from which skill symlinks exist in `~/.claude/skills/`.

2. **Run checks.** For each installed layer, verify the same items as Phase 6 of the setup wizard:

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

3. **Report results.** Show a clean pass/fail summary:

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
   ```

4. **If anything failed:** Show "These items need attention:" with specific, plain-English guidance on how to fix each one. Offer to fix automatically where possible. For issues that require re-running setup, suggest: "You can fix this by running `/setup-wizard` — it's safe to run again and won't change your existing settings."

5. **If everything passed:** Show: "Everything looks good! All [N] checks passed."
