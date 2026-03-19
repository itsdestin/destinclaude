---
description: Check for toolkit updates and install the latest version
---

Check for and install updates to the DestinClaude toolkit.

## Steps

1. **Read current version.** Check the VERSION file in the toolkit root directory (the parent of this plugin's directory). Store this as `CURRENT_VERSION`.

2. **Fetch latest release info.** Run in the toolkit root directory:
   ```bash
   git fetch --tags origin 2>/dev/null
   ```
   If this fails (e.g., offline), tell the user: "Can't check for updates — you appear to be offline. Try again when you have an internet connection."

3. **Find the latest release tag.** Run:
   ```bash
   git tag --sort=-v:refname | head -1
   ```
   Store this as `LATEST_TAG`. If no tags exist, tell the user: "No releases found. You're running a development version."

4. **Compare versions.** If `CURRENT_VERSION` matches the latest tag (strip the leading `v` for comparison), tell the user: "You're on the latest version (CURRENT_VERSION)." and stop.

5. **Show what changed.** If behind, show the changelog between versions:
   ```bash
   git log --oneline CURRENT_TAG..LATEST_TAG
   ```
   Present this in plain language: "Here's what changed since your version:" followed by a readable summary of the commits.

6. **Ask to proceed.** Ask the user: "Would you like to update to LATEST_TAG?"

7. **Merge the update.** If the user agrees:
   ```bash
   git merge LATEST_TAG --no-edit
   ```
   Use merge (not rebase) — this is safer for non-technical users and avoids interactive editor invocations.

8. **Handle merge conflicts.** If the merge has conflicts:
   - List the conflicted files
   - Explain in plain language what each conflict is about
   - Offer to help resolve them one by one
   - After resolving, complete the merge with `git add` and `git commit`

9. **Refresh installed hooks and scripts.** This is critical — without this step, updated hook code stays in the repo but never reaches the active hooks that Claude Code actually runs.

   **Safety rules:**
   - Only overwrite files that have a matching source in the toolkit repo (toolkit-owned files)
   - Never touch files in `~/.claude/hooks/` that don't correspond to a known toolkit hook
   - Never auto-delete anything — flag orphan/stale files and ask the user for permission before removing
   - If a file in `~/.claude/hooks/` doesn't exist in the toolkit repo, it may be user-created — leave it alone

   Read `~/.claude/toolkit-state/config.json` to get `toolkit_root`. Detect whether symlinks work on this platform:

   ```bash
   TEST_LINK="$HOME/.claude/hooks/.symlink-test"
   ln -sf "$TOOLKIT_ROOT/VERSION" "$TEST_LINK" 2>/dev/null
   if [ -e "$TEST_LINK" ]; then
       LINK_CMD="ln -sf"
       rm -f "$TEST_LINK"
   else
       LINK_CMD="cp -f"
       rm -f "$TEST_LINK" 2>/dev/null
   fi
   ```

   Then refresh toolkit-owned hook files and utility scripts:

   ```bash
   # Core hooks (canonical list — ONLY these get overwritten)
   for hook in checklist-reminder.sh git-sync.sh session-start.sh title-update.sh todo-capture.sh write-guard.sh; do
     $LINK_CMD "$TOOLKIT_ROOT/core/hooks/$hook" ~/.claude/hooks/$hook
   done

   # Utility scripts called by hooks
   for util in announcement-fetch.js usage-fetch.js; do
     $LINK_CMD "$TOOLKIT_ROOT/core/hooks/$util" ~/.claude/hooks/$util
   done

   # Statusline script (lives at ~/.claude/, not in hooks/)
   $LINK_CMD "$TOOLKIT_ROOT/core/hooks/statusline.sh" ~/.claude/statusline.sh

   # Core commands
   for cmd in setup-wizard.md contribute.md toolkit.md toolkit-uninstall.md update.md health.md; do
     [ -f "$TOOLKIT_ROOT/core/commands/$cmd" ] && $LINK_CMD "$TOOLKIT_ROOT/core/commands/$cmd" ~/.claude/commands/$cmd
   done
   ```

   If using `cp -f` (copy fallback), tell the user: "Updated hooks via copy (symlinks not available). Everything works the same."

   If using `ln -sf`, tell the user: "Refreshed all hooks and scripts."

   **Also refresh any layer-specific hooks** based on `installed_layers` in config:
   - If `"life"` is installed and `$TOOLKIT_ROOT/life/hooks/` exists, refresh those too
   - If `"productivity"` is installed and `$TOOLKIT_ROOT/productivity/hooks/` exists, refresh those too

   **Scan for orphan files.** After refreshing, scan `~/.claude/hooks/` for files that don't match any known toolkit hook. For each orphan found:
   - Check if the file is a known pre-v1.1.5 orphan (e.g., `~/.claude/hooks/statusline.sh` — a stale copy that nothing references since `settings.json` points to `~/.claude/statusline.sh`)
   - List all orphans and explain what each one is (or that it's unrecognized)
   - **Ask the user:** "These files in `~/.claude/hooks/` don't match any current toolkit hook. They may be leftovers from a previous version or files you created. Want me to remove any of them?"
   - Only delete files the user explicitly approves
   - Never delete files silently

10. **Check for new dependencies.** After a successful merge, check if the setup wizard's verification phase should run (look for changes in plugin.json files or new dependency requirements). If so, suggest: "This update may have added new features. Want me to run a quick setup check?"

11. **Update VERSION.** Write the new version (without the `v` prefix) to the VERSION file in the toolkit root.

12. **Check for new MCPs.** Read `<toolkit_root>/core/mcp-manifest.json`. Detect the current platform. Load registered MCP servers from `~/.claude.json`. For each manifest entry matching the current platform that is NOT registered in `~/.claude.json`:
    - Collect it as a "new available MCP"

    If any are found, tell the user:

    ```
    New MCP servers are available in this version:

      macos-automator ........ AppleScript + JXA automation for any Mac app
      home-mcp ............... HomeKit device, scene, and automation control

    Run /health to register them — it takes about 30 seconds.
    ```

    Only show `auto: true` MCPs here. For `auto: false` MCPs that are unregistered, add a separate note:

    ```
    These MCPs require additional setup (run /setup-wizard to configure):
      imessages .............. Requires Full Disk Access for your terminal
    ```

    If nothing is new/missing, skip this step silently.

13. **Register missing marketplace plugins.** Load `~/.claude/settings.json`. Check the `enabledPlugins` key (create it if missing). For each plugin in the canonical list below that is NOT already present, add it with value `true` and write the file back. Do this silently without asking — plugins are zero-config and download automatically on first use.

    Canonical plugin list:
    ```
    superpowers@claude-plugins-official
    claude-md-management@claude-plugins-official
    code-review@claude-plugins-official
    code-simplifier@claude-plugins-official
    commit-commands@claude-plugins-official
    feature-dev@claude-plugins-official
    hookify@claude-plugins-official
    skill-creator@claude-plugins-official
    explanatory-output-style@claude-plugins-official
    learning-output-style@claude-plugins-official
    context7@claude-plugins-official
    linear@claude-plugins-official
    playwright@claude-plugins-official
    plugin-dev@claude-plugins-official
    ```

    If any were added, include a line in the final confirmation:
    ```
    Registered N new plugin(s): hookify, linear, plugin-dev
    ```
    If all were already registered, skip this line.

14. **Confirm update.** Tell the user: "Updated to LATEST_TAG. Now let me verify everything is working."

15. **Post-update verification.** Run a comprehensive check of all features that depend on the hook/script distribution pipeline. This catches problems before the user discovers them in a future session.

    ### 15a: Hook file freshness

    For each expected hook file, compare the installed version against the repo version:

    ```bash
    STALE=""
    for f in checklist-reminder.sh git-sync.sh session-start.sh title-update.sh todo-capture.sh write-guard.sh; do
      if [ -f ~/.claude/hooks/$f ] && [ -f "$TOOLKIT_ROOT/core/hooks/$f" ]; then
        if ! diff -q ~/.claude/hooks/$f "$TOOLKIT_ROOT/core/hooks/$f" >/dev/null 2>&1; then
          STALE="$STALE $f"
        fi
      elif [ ! -f ~/.claude/hooks/$f ]; then
        STALE="$STALE $f(missing)"
      fi
    done
    # Also check utility scripts
    for f in announcement-fetch.js usage-fetch.js; do
      if [ -f ~/.claude/hooks/$f ] && [ -f "$TOOLKIT_ROOT/core/hooks/$f" ]; then
        if ! diff -q ~/.claude/hooks/$f "$TOOLKIT_ROOT/core/hooks/$f" >/dev/null 2>&1; then
          STALE="$STALE $f"
        fi
      elif [ ! -f ~/.claude/hooks/$f ]; then
        STALE="$STALE $f(missing)"
      fi
    done
    # Statusline
    if [ -f ~/.claude/statusline.sh ] && [ -f "$TOOLKIT_ROOT/core/hooks/statusline.sh" ]; then
      if ! diff -q ~/.claude/statusline.sh "$TOOLKIT_ROOT/core/hooks/statusline.sh" >/dev/null 2>&1; then
        STALE="$STALE statusline.sh"
      fi
    elif [ ! -f ~/.claude/statusline.sh ]; then
      STALE="$STALE statusline.sh(missing)"
    fi
    ```

    If `$STALE` is non-empty, show the stale/missing files and offer to re-copy them. This is the most common failure mode — if this check passes, everything else usually works.

    ### 15b: Settings.json hook registrations

    Read `~/.claude/settings.json` and verify all expected hooks are registered at the correct trigger points using the **nested `hooks` array format** (each entry must have a `hooks` array containing `{ "type": "command", "command": "..." }` objects — NOT a flat `command` property):

    | Hook | Trigger | Matcher |
    |------|---------|---------|
    | `session-start.sh` | `SessionStart` | `startup` |
    | `write-guard.sh` | `PreToolUse` | `Write\|Edit` |
    | `git-sync.sh` | `PostToolUse` | `Write\|Edit` |
    | `title-update.sh` | `PostToolUse` | `.*` |
    | `todo-capture.sh` | `UserPromptSubmit` | `.*` |
    | `checklist-reminder.sh` | `Stop` | `.*` |

    Each entry must look like: `{ "matcher": "...", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/foo.sh" }] }` — NOT `{ "command": "bash ~/.claude/hooks/foo.sh" }`.

    Also verify:
    ```json
    "statusLine": {
      "type": "command",
      "command": "bash ~/.claude/statusline.sh"
    }
    ```

    If any registrations are missing, use the wrong schema format, or the statusline isn't configured, offer to fix them by merging the correct entries into `settings.json`.

    ### 15c: Feature-by-feature diagnostic

    Run these checks and report results in a table:

    ```
    Post-Update Verification
    ════════════════════════════════════════════════════

    Hook Freshness:
      session-start.sh .................. OK
      statusline.sh ..................... OK
      title-update.sh ................... OK
      git-sync.sh ....................... OK
      announcement-fetch.js ............. OK
      usage-fetch.js .................... OK

    Feature Pipeline:
      Session Naming .................... OK
        └─ title-update.sh registered at PostToolUse, topic dir exists
      Sync Status ....................... OK
        └─ git-sync.sh registered at PostToolUse, .sync-status exists
      Announcements ..................... OK
        └─ announcement-fetch.js reachable, cache file exists
      Version / Update Warning .......... OK
        └─ update-status.json exists, shows vX.Y.Z
      Rate Limits ....................... OK
        └─ usage-fetch.js reachable from statusline.sh
      Statusline ........................ OK
        └─ Configured in settings.json, script exists

    ════════════════════════════════════════════════════
    ```

    For each feature, check:

    1. **Session Naming:** `title-update.sh` exists in `~/.claude/hooks/`, registered as `PostToolUse` in settings.json, `~/.claude/topics/` directory exists or can be created.

    2. **Sync Status:** `git-sync.sh` exists in `~/.claude/hooks/`, registered as `PostToolUse` for `Write|Edit` in settings.json, `~/.claude/.sync-status` file exists (OK if missing — gets created on first write).

    3. **Announcements:** `announcement-fetch.js` exists and is reachable (check `~/.claude/hooks/announcement-fetch.js` OR resolve via `toolkit_root` in config). Cache file `~/.claude/.announcement-cache.json` exists (OK if missing — gets created on first session start).

    4. **Version / Update Warning:** `~/.claude/toolkit-state/update-status.json` exists and contains valid JSON with `current` and `update_available` keys.

    5. **Rate Limits:** `usage-fetch.js` is reachable from `statusline.sh`. To verify: read `~/.claude/toolkit-state/config.json` for `toolkit_root`, check that `$toolkit_root/core/hooks/usage-fetch.js` exists. Also check the local copy at `~/.claude/hooks/usage-fetch.js`.

    6. **Statusline:** `settings.json` contains a `statusLine` entry pointing to a script that exists. Run the script with mock session data and verify it produces output:
       ```bash
       echo '{"session_name":"Update Verification","model":{"display_name":"Claude Opus 4"},"context_window":{"remaining_percentage":85}}' | bash ~/.claude/statusline.sh
       ```
       Show the actual output to the user.

    ### 15d: Visual statusline check

    Show the user what a healthy statusline looks like, then show what theirs actually produces:

    ```
    Here's what your statusline should look like after this update:

    ┌─────────────────────────────────────────────────────────────┐
    │ Session Topic Here                    ★ Announcement Text   │
    │ OK: Changes Synced                                          │
    │ Claude Opus 4  Context Remaining: 85%                       │
    │ 5h (12%): Resets at 3:45 PM | 7d (8%): Resets on Friday... │
    │ DestinClaude vX.Y.Z                                         │
    └─────────────────────────────────────────────────────────────┘

    Line 1: Session name (bold white) + announcement (yellow, right-aligned)
    Line 2: Sync status (green/yellow/red)
    Line 3: Model name + context remaining percentage
    Line 4: Rate limit utilization (if available)
    Line 5: Toolkit version (yellow if update available)
    ```

    Then run the actual statusline with mock data and show the raw output:

    ```bash
    echo '{"session_name":"Update Verification","model":{"display_name":"Claude Opus 4"},"context_window":{"remaining_percentage":85}}' | bash ~/.claude/statusline.sh
    ```

    Show the output and ask: "Does your statusline match the reference above? If any lines are missing or look wrong, I can diagnose and fix the issue."

    ### 15e: Diagnose and repair

    If the user reports a problem, or if any check in 15a-15c failed:

    1. **Stale files:** Re-copy from repo. If that fails, check if `toolkit_root` in config.json is correct.
    2. **Missing settings.json entries:** Merge the missing hook registrations or statusline config.
    3. **Script not found:** Check if the toolkit root path is correct. If `config.json` has a stale path (e.g., from a previous machine), update it.
    4. **Node.js not found:** Some features (rate limits, announcements, version check) require Node.js. Check `command -v node` and suggest installing it if missing.
    5. **Statusline produces no output:** Check for bash errors by running with `bash -x ~/.claude/statusline.sh`. Common causes: missing `node`, broken JSON in session data, missing utility scripts.

    After repairs, re-run the verification to confirm the fix.

16. **Final confirmation.** After verification passes (or repairs are complete):

    ```
    Update complete — DestinClaude vX.Y.Z

    All N checks passed. Your hooks, statusline, and features are up to date.
    Restart Claude Code to pick up the new session-start hook.
    ```

    If the user had to restart for session-start changes, remind them: "The session-start hook runs once when Claude starts — restart Claude Code to activate the updated version."
