---
description: Remove the toolkit and restore your previous setup
---

Safely remove the DestinClaude toolkit and restore the user's previous configuration.

## Steps

1. **Confirm with user.** Ask: "This will remove the DestinClaude toolkit and restore your previous setup. Are you sure you want to uninstall?" Wait for explicit confirmation before proceeding.

2. **Read backup manifest.** Check for the pre-toolkit backup at `~/.claude/backups/pre-toolkit/`. Read the manifest file (`manifest.json`) which records:
   - Files that were backed up before the toolkit modified them
   - Files that the toolkit added (no backup exists)
   - The date the toolkit was installed

   If no backup manifest exists, warn the user: "No backup manifest found — the toolkit may have been installed before the backup system was in place. I'll remove toolkit components but can't restore previous versions of modified files. Proceed?"

3. **Restore backed-up files.** For each file listed in the manifest as backed up:
   - Copy the backup version back to its original location
   - Confirm the restore succeeded
   - Example: `~/.claude/backups/pre-toolkit/CLAUDE.md` → `~/.claude/CLAUDE.md`

4. **Remove toolkit-added files.** For each file listed in the manifest as added by the toolkit (no prior backup):
   - Remove the file
   - Remove any now-empty parent directories

5. **Clean CLAUDE.md.** If CLAUDE.md was modified (not replaced), remove only the sections between toolkit marker comments. The setup wizard wraps each section with markers like:
   ```
   <!-- destinclaude:section-name:start -->
   ...content added by toolkit...
   <!-- destinclaude:section-name:end -->
   ```
   Find and remove all `<!-- destinclaude:*:start -->` / `<!-- destinclaude:*:end -->` blocks (and their contents). Leave all other content intact.

6. **Remove toolkit plugins.** Remove the toolkit plugin directories from Claude Code's plugin system. The plugin directories are the layer folders (`core/`, `life/`, `productivity/`, `modules/`) within the toolkit installation directory.

7. **Remove toolkit state.** Delete the toolkit state directory:
   - `~/.claude/toolkit-state/` (contains config, contribution tracker, update status)

8. **Preserve the toolkit repo.** Do NOT delete the cloned repo itself — the user might want to reinstall later. Mention: "The toolkit repository is still on your computer at [path]. You can delete it manually if you want, or keep it in case you want to reinstall later."

9. **Summary.** Report what was done:
   - How many files were restored from backup
   - How many toolkit-added files were removed
   - Any files that couldn't be restored (and why)
   - "Your previous setup has been restored. The toolkit has been removed."

10. **Suggest restart.** Tell the user: "You may want to restart Claude Code for all changes to take effect."
