---
description: Quick health check — verify the toolkit is installed and hooks are reconciled
---

Run a lightweight health check on the installed toolkit. Use this when the user wants to confirm everything is working, or after troubleshooting an issue.

Post-decomposition, the DestinCode app owns reconciliation (hooks, MCPs, integration context) on every launch. This check verifies the results — it does not install anything.

## Steps

1. **Detect platform.**
   ```bash
   case "$(uname -s)" in
     Darwin*)  echo "macos" ;;
     MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
     Linux*)   echo "linux" ;;
   esac
   ```

2. **Core checks.**

   - [ ] `git --version` succeeds
   - [ ] Toolkit root exists: `~/.claude/plugins/destinclaude/` and contains `VERSION` and `plugin.json`
   - [ ] `enabledPlugins["destinclaude@destincode"]` is `true` in `~/.claude/settings.json`
   - [ ] At least one plugin-owned hook is registered in `~/.claude/settings.json` under `hooks.*` (confirms the app's HookReconciler ran)
   - [ ] `~/.claude/settings.json` does not contain hook entries whose command points inside the plugin root at a file that no longer exists (the reconciler's prune pass should have cleared these on the last app launch — if any remain, warn that reconciliation didn't complete)

3. **Statusline check.**

   - [ ] A statusline command is configured in `~/.claude/settings.json` (top-level `statusLine` or a `Notification` hook invoking `statusline.sh`)
   - [ ] The referenced script file exists on disk

4. **MCP availability check.** Read `<toolkit_root>/mcp-manifest.json`. Load registered MCP servers from `~/.claude.json` (`mcpServers`). For each manifest entry with `platform` matching the current platform and `auto: true`:
   - Skip if already registered
   - Otherwise flag as **available but not registered** (the app's McpReconciler should register `auto: true` entries on launch — if any are missing, warn that reconciliation didn't complete)

   Show a summary:
   ```
   MCP Servers:
     macos-automator .............. OK
     apple-events ................. OK
     home-mcp ..................... NOT REGISTERED (expected auto-register)
   ```

5. **Report results.** Show a clean pass/fail summary:

   ```
   Toolkit Health Check

   Core:
     Git ................................. OK
     Toolkit root ........................ OK
     Plugin enabled ...................... OK
     Hooks reconciled .................... OK
     Statusline .......................... OK

   MCP Servers:
     [per step 4 above]
   ```

6. **If anything failed:** Show "These items need attention:" with plain-English guidance. Most failures here indicate the app's startup reconcilers did not run — suggest restarting the DestinCode app. For dependency issues (missing `git`, etc.), show the install command for the current platform.

7. **If everything passed:** Show "Everything looks good! All [N] checks passed."
