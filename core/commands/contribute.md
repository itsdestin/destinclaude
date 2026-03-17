---
description: Contribute your toolkit improvements back to the upstream project
---

Help the user contribute their local toolkit improvements back to the upstream DestinClaude repo as a pull request.

## Steps

1. **Check GitHub CLI.** Verify `gh` is installed and authenticated:
   ```bash
   gh auth status
   ```
   If not authenticated, walk the user through `gh auth login` step by step. Explain what GitHub is and why it's needed (in simple terms).

2. **Check for a fork.** See if the user already has a fork:
   ```bash
   gh repo list --fork --json nameWithOwner | grep destinclaude
   ```
   If no fork exists, create one:
   ```bash
   gh repo fork itsdestin/destinclaude --clone=false
   ```

3. **Find changes.** In the toolkit root directory, diff against the installed release tag:
   ```bash
   INSTALLED_TAG=$(cat VERSION | sed 's/^/v/')
   git diff ${INSTALLED_TAG}..HEAD -- core/ life/ productivity/ modules/
   ```

4. **Filter private content.** Read `.private-manifest` from the toolkit root. Exclude any changed files whose paths match patterns in the manifest. Also always exclude:
   - `**/encyclopedia/**`
   - `**/journal/**`
   - `**/memory/**`
   - `**/.env`
   - `**/*token*`, `**/*secret*`, `**/*credential*`
   - Any file inside a `.private/` directory

5. **Check for meaningful changes.** If no changes remain after filtering, tell the user: "No toolkit changes to contribute. Your local changes are all in private/personal files (which is totally fine)."

6. **Present changes.** Show the user what they changed in plain language:
   - Group by file
   - Explain what each change does
   - Example: "You improved the inbox processor to handle attachments better"

7. **Let user select.** Ask which changes they'd like to include. They can pick all or choose specific files.

8. **Create a contribution branch.** Ask the user for a short description of their change (or suggest one). Then:
   ```bash
   git checkout -b contrib/<short-description>
   ```

9. **Commit selected changes.** Stage only the selected files and create a commit with a clear message describing the contribution.

10. **Push to fork.** Ensure the fork remote is configured, then push:
    ```bash
    # Add fork remote if not already present
    FORK_OWNER=$(gh api user --jq .login)
    git remote add fork https://github.com/${FORK_OWNER}/destinclaude.git 2>/dev/null || true
    git push fork contrib/<short-description>
    ```

11. **Create pull request.**
    ```bash
    gh pr create --repo itsdestin/destinclaude --head ${FORK_OWNER}:contrib/<short-description> --title "<descriptive title>" --body "<plain-language description of the changes>"
    ```

12. **Report success.** Show the user the PR URL and tell them: "Done! The maintainer will see your suggestion. Thanks for contributing!"

13. **Clean up.** Switch back to the previous branch:
    ```bash
    git checkout -
    ```

14. **Update tracker.** If `~/.claude/toolkit-state/contribution-tracker.json` exists, move the contributed file paths from `suggested` to `contributed` with the PR URL.
