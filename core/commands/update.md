---
description: Check for toolkit updates and install the latest version
---

Check for and install updates to the DestinClaude toolkit.

## Steps

1. **Read current version.** Read the VERSION file in the toolkit root directory. Store this as `CURRENT_VERSION`. You will need it later as the pre-merge version.

2. **Fetch latest release info.** Run in the toolkit root:
   ```bash
   git fetch --tags origin 2>/dev/null
   ```
   If this fails (e.g., offline), tell the user: "Can't check for updates — you appear to be offline."

3. **Find the latest release tag.**
   ```bash
   git tag --sort=-v:refname | head -1
   ```
   Store as `LATEST_TAG`. If no tags exist: "No releases found. You're running a development version."

4. **Compare versions.** If `CURRENT_VERSION` matches `LATEST_TAG` (strip leading `v`): "You're on the latest version (CURRENT_VERSION)." — stop.

5. **Show what changed.**
   ```bash
   git log --oneline v$CURRENT_VERSION..$LATEST_TAG
   ```
   Present: "Here's what changed since your version:" with a readable summary.

6. **Ask to proceed.** "Would you like to update to LATEST_TAG?"

7. **Merge the update.**
   ```bash
   git merge $LATEST_TAG --no-edit
   ```

8. **Handle merge conflicts.** If the merge has conflicts: list conflicted files, explain each, offer to resolve one by one. After resolving, complete with `git add` and `git commit`.

9. **Pre-flight check on post-update.sh.**
   ```bash
   bash -n "$TOOLKIT_ROOT/scripts/post-update.sh"
   ```
   If the syntax check fails, warn the user and fall back to a minimal inline refresh:
   ```bash
   [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && export MSYS=winsymlinks:nativestrict
   for layer in $(node -e "JSON.parse(require('fs').readFileSync('$HOME/.claude/toolkit-state/config.json','utf8')).installed_layers.forEach(l=>console.log(l))"); do
     for f in "$TOOLKIT_ROOT/$layer/hooks/"*.sh; do [ -f "$f" ] && ln -sf "$f" ~/.claude/hooks/$(basename "$f"); done
     for d in "$TOOLKIT_ROOT/$layer/skills/"*/; do [ -d "$d" ] && ln -sfn "$d" ~/.claude/skills/$(basename "$d"); done
   done

   # JS utility scripts called by hooks
   for f in "$TOOLKIT_ROOT/core/hooks/"*.js; do [ -f "$f" ] && ln -sf "$f" ~/.claude/hooks/$(basename "$f"); done

   # Shared libraries
   mkdir -p ~/.claude/hooks/lib
   for lib in backup-common.sh migrate.sh; do
     [ -f "$TOOLKIT_ROOT/core/hooks/lib/$lib" ] && ln -sf "$TOOLKIT_ROOT/core/hooks/lib/$lib" ~/.claude/hooks/lib/$lib
   done

   # Migration scripts
   if [ -d "$TOOLKIT_ROOT/core/hooks/migrations" ]; then
     mkdir -p ~/.claude/hooks/migrations
     for migration in "$TOOLKIT_ROOT/core/hooks/migrations"/*; do
       [ -f "$migration" ] && ln -sf "$migration" ~/.claude/hooks/migrations/$(basename "$migration")
     done
   fi

   # Statusline script (lives at ~/.claude/, not in hooks/)
   ln -sf "$TOOLKIT_ROOT/core/hooks/statusline.sh" ~/.claude/statusline.sh

   # Core commands
   for f in "$TOOLKIT_ROOT/core/commands/"*.md; do [ -f "$f" ] && ln -sf "$f" ~/.claude/commands/$(basename "$f"); done

   # Skills � re-symlink all toolkit-managed skills
   ln -sf "$TOOLKIT_ROOT/core/skills/setup-wizard" ~/.claude/skills/setup-wizard
   # Layer-specific skills based on installed_layers in config
   ```
   Then skip to step 19 (final confirmation), noting that full verification can be done via `/health`.

10. **Update VERSION file.** Write the new version (strip `v` prefix from `LATEST_TAG`) to `$TOOLKIT_ROOT/VERSION`. This is handled by the skill, not the script. Also update the statusline version cache so the current session reflects the new version immediately:
    ```bash
    echo "{\"current\": \"${LATEST_TAG#v}\", \"latest\": \"${LATEST_TAG#v}\", \"update_available\": false}" > ~/.claude/toolkit-state/update-status.json
    ```

11. **Run self-check.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" self-check
    ```
    If output contains a `[FAIL]` for `toolkit_root` with "stale", ask the user to confirm the new path and update `config.json`.

12. **Run migrations.** Pass the PRE-MERGE version (stored in step 1) as FROM:
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" migrations $CURRENT_VERSION ${LATEST_TAG#v}
    ```

13. **Refresh symlinks.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" refresh
    ```
    Present output. Highlight `[NEW]` items ("This version adds:") and `[WARN]` items ("Converted from copies:").

14. **Handle orphans.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" orphans
    ```
    For each `[ORPHAN]` line: explain what the file is, ask if the user wants to remove it. If approved:
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" remove-orphan FILENAME
    ```
    Never delete without explicit per-file approval.

15. **Check MCPs.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" mcps
    ```
    If `[NEW]` auto-install MCPs found: "New MCP servers available — run /health to register them."
    If `[INFO]` manual MCPs found: note they need `/setup-wizard`.

16. **Register missing plugins.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" plugins
    ```
    If `[NEW]` plugins found: add them to `settings.json`'s `enabledPlugins` (zero-config, no approval needed). Tell the user which ones were added.

17. **Verify everything.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" verify
    ```
    Present results as a verification table. For any `[FAIL]`: explain the problem, offer to fix it. After fix, re-run just that verification. For `[FAIL]` items suggesting missing dependencies, suggest `/setup-wizard` or `/health`.

18. **Check plugin dependencies.**
    ```bash
    bash "$TOOLKIT_ROOT/scripts/post-update.sh" deps
    ```
    For any `[MISSING]` dependencies: explain which plugin needs it, what symptoms the user will see (e.g., "hook error on every tool call"), show the install command, and offer to install. This is especially important after updates since new plugin versions may introduce new dependencies.

19. **Desktop app update.** If `$TOOLKIT_ROOT/desktop/scripts/install-app.sh` exists, ask if the user wants to update the desktop app. If yes:
    ```bash
    bash "$TOOLKIT_ROOT/desktop/scripts/install-app.sh"
    ```

20. **Final confirmation.**
    ```
    Update complete — DestinClaude vX.Y.Z

    All N checks passed. Restart Claude Code to pick up the new session-start hook.
    ```
