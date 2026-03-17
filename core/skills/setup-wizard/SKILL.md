---
name: setup-wizard
description: Interactive toolkit installer — inventories the user's environment, resolves conflicts, installs dependencies, personalizes templates, and verifies everything works. Invoked via /setup or when user says "set me up."
---

# ClaudifestDestiny Setup Wizard

You are the setup wizard for the ClaudifestDestiny toolkit. Walk the user through a complete installation conversationally — explaining each step in plain language. The user may be non-technical; never assume familiarity with developer tools.

**Golden rule:** This wizard is **additive and non-destructive**. Never overwrite, delete, or modify existing user files without explicit permission. Always back up before changing anything.

**Runtime variables:** Throughout this process, collect configuration values and store them in `~/.claude/toolkit-state/config.json`. Create the directory if it doesn't exist.

---

## Phase 1: Environment Inventory

Before installing anything, understand what's already on the user's system.

### Step 1: Detect the platform

Run this in Bash to detect the OS:

```bash
case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*)  echo "windows" ;;
    Linux*)  echo "linux" ;;
esac
```

Store the result as `platform` in your working state. You'll use it throughout setup to choose platform-appropriate install commands.

### Step 2: Find the toolkit root

The toolkit is a Claude Code plugin. Determine where it's installed by checking the directory this skill lives in — navigate up from the skill path to find the monorepo root (the directory containing `VERSION` and `core/`). Store this as `toolkit_root`.

### Step 3: Scan for existing Claude Code setup

Check for each of the following and record what you find:

1. **Existing skills** — Run `ls ~/.claude/skills/` if it exists. Compare against toolkit skill names (journaling-assistant, encyclopedia-update, encyclopedia-compile, encyclopedia-interviewer, encyclopedia-librarian, inbox-processor, skill-creator, google-drive).
2. **Existing CLAUDE.md** — Read `~/.claude/CLAUDE.md` if it exists. Note its length and whether it contains any of the toolkit's section markers (`## Installed Skills`, `## Specs System`, `## System Change Protocol`, `## MCP Server Configuration`).
3. **Existing hooks** — Check `~/.claude/hooks/` for any hook scripts. List what you find.
4. **Existing plugins** — Check if any Claude Code plugins are already installed by looking at the user's Claude Code settings or scanning `~/.claude/plugins/` if it exists.
5. **Existing MCP servers** — Check `~/.claude.json` or `~/.claude/mcp.json` for configured MCP servers. Note which ones are present.
6. **Existing memory system** — Check if `~/.claude/memory/` or any project-level memory directories exist.

### Step 4: Present findings

Show the user a clear summary:

```
Here's what I found on your system:

Platform: [macOS / Windows / Linux]
Toolkit location: [path]

Existing setup:
  Skills: [list or "None found"]
  CLAUDE.md: [exists with N lines / not found]
  Hooks: [list or "None found"]
  Plugins: [list or "None found"]
  MCP servers: [list or "None found"]
  Memory: [exists / not found]
```

If conflicts exist (toolkit skills that share names with existing skills, existing hooks at the same trigger points, etc.), note them — they'll be resolved in Phase 2.

If nothing exists, say: "Clean slate — this will be a fresh install. Easy!"

**Wait for the user to acknowledge before proceeding to Phase 2.**

---

## Phase 2: Conflict Resolution

If Phase 1 found no existing setup, skip to Phase 3.

For each conflict discovered in Phase 1, resolve it conversationally with the user. **Always back up before modifying anything.**

### Step 1: Create backup directory

```bash
mkdir -p ~/.claude/backups/pre-toolkit
```

### Step 2: Resolve CLAUDE.md conflicts

If `~/.claude/CLAUDE.md` exists:

1. Back it up: `cp ~/.claude/CLAUDE.md ~/.claude/backups/pre-toolkit/CLAUDE.md`
2. Check if it already contains toolkit section markers (added during a previous install)
3. If toolkit sections exist: tell the user "Looks like a previous install left some toolkit sections. I'll update them in place."
4. If no toolkit sections: tell the user "You have an existing CLAUDE.md. I'll **append** the toolkit sections at the end — your existing content stays untouched."

Do NOT modify CLAUDE.md yet — that happens in Phase 5 (Personalization). Just record the strategy.

### Step 3: Resolve hook conflicts

For each hook script in the user's `~/.claude/hooks/` that shares a filename or trigger point with a toolkit hook:

1. Back up: `cp ~/.claude/hooks/<name> ~/.claude/backups/pre-toolkit/<name>`
2. Show the user both versions side by side (a brief summary, not full source)
3. Offer three options:
   - **Merge** — combine both hooks into one script (you'll do this programmatically)
   - **Keep yours** — skip installing the toolkit's version of this hook
   - **Use toolkit's** — replace with the toolkit version (backup already saved)
4. Record the user's choice for each conflict

### Step 4: Resolve skill name conflicts

For each skill directory in `~/.claude/skills/` that shares a name with a toolkit skill:

1. Tell the user: "You already have a skill called `<name>`. The toolkit also includes one with that name."
2. Show a brief comparison (description from each)
3. Offer:
   - **Keep yours** — the toolkit version won't be installed
   - **Use toolkit's** — replace with toolkit version (original backed up)
   - **Rename yours** — rename the user's existing skill so both can coexist
4. Record the choice

### Step 5: Resolve MCP server conflicts

If any existing MCP server names match toolkit servers (e.g., `gmessages`, `todoist`):

1. Show the user the existing config vs. what the toolkit would set up
2. Offer: **Keep yours** / **Use toolkit's** / **Skip this server**
3. Record the choice

**After all conflicts are resolved, confirm:** "All conflicts resolved. Here's the plan: [summary of decisions]. Ready to choose your layers?"

---

## Phase 3: Layer Selection

Present the installable layers and let the user choose.

### Step 1: Explain the layers

Tell the user:

```
ClaudifestDestiny has four layers you can install:

  Core (always installed)
    Infrastructure that makes everything else work — git hooks for
    file protection, a specs system for documenting decisions, memory
    templates, and CLAUDE.md configuration fragments.

  Life (recommended)
    A personal knowledge system — daily journaling with a
    conversational assistant, and an Encyclopedia system that builds
    a living biography from your journal entries over time.

  Productivity (recommended)
    Task management and communication — an inbox processor that
    triages notes from your phone, a skill creator for building
    new Claude skills, and a Google Messages integration for
    reading/sending texts.

  Modules (optional, pick individually)
    Specialized tools for niche use cases:
    - Elections Notebook — tracks Arizona legislative candidates
      and campaign finance data
    - JLBC Fiscal Note — drafts fiscal impact analyses for
      Arizona legislation

Which would you like?
  1. Full install (everything)
  2. Core + Life + Productivity (skip modules)
  3. Core only (just the basics)
  4. Let me pick individually
```

### Step 2: Handle individual selection

If the user picks option 4, walk through each layer and each module, asking yes/no.

### Step 3: Record selections

Store the selected layers in `~/.claude/toolkit-state/config.json`:

```json
{
  "platform": "<detected>",
  "toolkit_root": "<path>",
  "installed_layers": ["core", "life", "productivity"],
  "installed_modules": ["elections-notebook"],
  "conflict_resolutions": { ... },
  "installed_at": "<ISO timestamp>"
}
```

**Proceed to Phase 4.**

---

## Phase 4: Dependency Installation

Install external tools required by the selected layers. For each dependency, follow this pattern:

1. Check if already installed
2. If missing, explain what it is and why it's needed (plain language)
3. Install using the platform-appropriate command
4. Verify installation succeeded
5. If install fails, provide a manual download URL as fallback

Use the platform detected in Phase 1 to choose install commands.

### Core Dependencies

These are always checked regardless of layer selection.

#### git

```bash
git --version
```

Should already be installed (they cloned the repo). If somehow missing, this is a blocker — tell the user to install git first and restart.

#### gh CLI (optional)

```bash
gh --version
```

Needed for the `/contribute` command (submitting improvements back upstream). Not required for basic usage.

If missing and the user wants it:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install gh` |
| Windows | `winget install GitHub.cli` |
| Linux | See https://github.com/cli/cli/blob/trunk/docs/install_linux.md |

After install, run `gh auth login` and walk the user through the browser-based auth flow.

### Life Dependencies

Only install if the Life layer was selected.

#### rclone

```bash
rclone --version
```

Needed for syncing journal and encyclopedia files with Google Drive.

If missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install rclone` |
| Windows | `winget install Rclone.Rclone` |
| Linux | `curl https://rclone.org/install.sh \| sudo bash` |

#### Google Drive authentication

After rclone is installed, set up the Google Drive remote:

1. Tell the user: "I need to connect rclone to your Google Drive. This will open a browser window for you to sign in with Google."
2. Run `rclone config` and guide them through creating a remote named `gdrive` with type `drive`.
3. Verify with: `rclone lsd gdrive:` — should list their Drive root folders.
4. If it works, confirm: "Google Drive connected successfully."

### Productivity Dependencies

Only install if the Productivity layer was selected.

#### Go compiler

```bash
go version
```

Needed to build the gmessages MCP server (Google Messages integration).

If missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install go` |
| Windows | `winget install GoLang.Go` |
| Linux | Download from https://go.dev/dl/ |

#### Build gmessages

Once Go is installed:

```bash
cd <toolkit_root>/productivity/mcp-servers/gmessages && go build
```

This produces `gmessages` on macOS/Linux or `gmessages.exe` on Windows. Store the binary name in the config:

```json
{
  "gmessages_binary": "gmessages.exe"
}
```

If the build fails, tell the user: "The messaging integration couldn't be built right now. Everything else will work — you can try again later by running `go build` in the gmessages directory."

#### Node.js (optional)

```bash
node --version
```

Some optional features may use Node.js. If missing and needed:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install node` |
| Windows | `winget install OpenJS.NodeJS.LTS` |
| Linux | Use nvm or package manager |

#### Todoist setup

If the user wants the inbox processor:

1. Ask: "Do you use Todoist for task management?"
2. If yes: "I'll need an API token. You can find it at todoist.com → Settings → Integrations → Developer. Paste it here."
3. Store the token securely in `~/.claude/toolkit-state/config.json` under `todoist_api_token`.
4. Verify by making a test API call: `curl -s -H "Authorization: Bearer <token>" https://api.todoist.com/rest/v2/projects | head -c 100`
5. If valid, confirm. If invalid, ask them to double-check the token.

### Summary

After all dependencies are installed, show a summary:

```
Dependencies installed:
  git: v2.x.x
  gh: v2.x.x (or "skipped")
  rclone: v1.x.x + Google Drive connected (or "not needed")
  go: v1.x.x + gmessages built (or "not needed")
  Todoist: connected (or "not needed")
```

**Proceed to Phase 5.**

---

## Phase 5: Personalization

Fill in template variables, install selected layers, and configure CLAUDE.md.

### Step 1: Collect template variables

Read `<toolkit_root>/core/templates/template-variables.json`. For each variable:

1. Show the user the prompt text from the variable definition
2. If there's a default, show it: "(default: Claude)"
3. Accept their answer, or use the default if they press enter / say "default is fine"
4. Store all responses in `~/.claude/toolkit-state/config.json` under a `variables` key

Example interaction:
```
What's your name? > Alex
Where should Claude store files on your Google Drive? (default: Claude) > Claude
What Todoist project should Claude use as your inbox? (default: Claude's Inbox) > My Inbox
```

Only ask about variables relevant to the selected layers. Skip `TODOIST_PROJECT` if Productivity isn't selected, skip `DRIVE_ROOT`/`JOURNAL_DIR`/`ENCYCLOPEDIA_DIR` if Life isn't selected.

### Step 2: Process template files

For each file listed in a variable's `used_in` array (and that belongs to an installed layer):

1. Read the file
2. Replace all `{{VARIABLE_NAME}}` placeholders with the user's values
3. Write the processed file back

### Step 3: Install encyclopedia starter templates (if Life layer selected)

Copy the starter templates from `<toolkit_root>/life/templates/` to the user's local encyclopedia directory (`~/.claude/<ENCYCLOPEDIA_DIR>/`):

1. For each template file (Core Identity.md, Status Snapshot.md, People Database.md, Chronicle.md, Beliefs and Positions.md, Predictions.md, Open Threads and Goals.md, Preferences and Reference Data.md):
   - Replace `{{USER_NAME}}` with the user's name
   - Write to the encyclopedia directory
2. Only copy files that don't already exist — never overwrite existing encyclopedia content

### Step 4: Merge CLAUDE.md fragments

Read the CLAUDE.md fragment templates from `<toolkit_root>/core/templates/claude-md-fragments/`. Each fragment is a section to add to the user's CLAUDE.md.

1. If `~/.claude/CLAUDE.md` doesn't exist, create it with a header and all selected fragments
2. If it exists (backed up in Phase 2):
   - For each fragment, check if its section marker already exists in the file
   - If not present, append it at the end
   - If already present (from a previous install), replace the section content between markers
3. Each fragment section is wrapped with markers for clean updates:

```markdown
<!-- claudifest:installed-skills:start -->
## Installed Skills
...
<!-- claudifest:installed-skills:end -->
```

### Step 5: Register the toolkit plugin

Claude Code does not auto-discover plugins from `~/.claude/plugins/`. The toolkit must be explicitly registered so it loads on every future session without `--plugin-dir`.

Register the root plugin (which includes core) by adding it to `~/.claude/settings.json` under `enabledPlugins`. Read the file first (create it if missing), then add:

```json
{
  "enabledPlugins": {
    "claudifest-destiny": "/path/to/toolkit"
  }
}
```

Use the actual `toolkit_root` path detected in Phase 1. Preserve any existing settings in the file.

For additional layers the user selected (life, productivity, modules), register each as a separate plugin entry pointing to its subdirectory:

```json
{
  "enabledPlugins": {
    "claudifest-destiny": "/path/to/toolkit",
    "claudifest-destiny-life": "/path/to/toolkit/life",
    "claudifest-destiny-productivity": "/path/to/toolkit/productivity"
  }
}
```

After writing, confirm: "Toolkit registered — from now on you can just run `claude` and everything will be loaded automatically."

### Step 6: Configure MCP servers (if applicable)

Based on selected layers and conflict resolutions from Phase 2:

1. **Todoist** (if Productivity selected and Todoist token provided):
   - Add to `~/.claude.json` under the appropriate mcpServers section
   - Use the stored API token

2. **gmessages** (if Productivity selected and build succeeded):
   - Add to `~/.claude.json` with the correct binary path
   - Note: the user will need to pair with their phone separately (link to gmessages README)

Show the user what MCP servers were configured.

---

## Phase 6: Verification

Run a health check on everything that was installed.

### Step 1: Core checks

- [ ] `git --version` returns successfully
- [ ] Toolkit root directory exists and contains `VERSION`
- [ ] `~/.claude/CLAUDE.md` exists and contains toolkit sections
- [ ] Hook scripts in `core/hooks/` are present and executable

### Step 2: Life checks (if installed)

- [ ] `rclone lsd gdrive:` returns successfully (Google Drive connected)
- [ ] Encyclopedia template files exist in `~/.claude/<ENCYCLOPEDIA_DIR>/`
- [ ] Journal directory exists or can be created at `~/.claude/<JOURNAL_DIR>/`

### Step 3: Productivity checks (if installed)

- [ ] gmessages binary exists (if Go was available)
- [ ] Todoist API responds (if token was provided)

### Step 4: Report results

For each check, show a pass/fail indicator:

```
Verification Results:

Core:
  Git installed ......................... OK
  Toolkit root valid ................... OK
  CLAUDE.md configured ................. OK
  Hooks installed ...................... OK

Life:
  Google Drive connected ............... OK
  Encyclopedia templates created ....... OK
  Journal directory ready .............. OK

Productivity:
  gmessages built ...................... OK
  Todoist connected .................... OK
```

If anything failed, show: "These items need attention:" with specific guidance on how to fix each one. Offer to retry the failed items.

### Step 5: Completion message

```
Setup complete! Here's what's installed:

  Layers: Core, Life, Productivity
  Skills: journaling-assistant, encyclopedia-*, inbox-processor, skill-creator
  Hooks: 8 active hooks for file protection and sync
  MCP servers: Todoist, gmessages

Try saying "let's journal" to start your first journal entry, or ask
me anything about what's installed.

Tip: Run /update anytime to check for toolkit updates.
     Run /contribute to share improvements you make back with the community.
```

Save the final config state to `~/.claude/toolkit-state/config.json` with `setup_completed: true` and `setup_completed_at: <ISO timestamp>`.

### Step 6: Feature request prompt

After the completion message, ask:

```
One last thing — is there anything you wish this toolkit could do that
it doesn't yet? A feature, integration, workflow, or quality-of-life
improvement? I can file it as a feature request on your behalf.
```

If the user has an idea:

1. Confirm: "Here's what I'd file: **[one-line summary]** — [brief description]. Sound right?"
2. Once approved, open a GitHub issue:
   ```bash
   gh issue create --repo itsdestin/claudifest-destiny \
     --title "Feature request: <summary>" \
     --label "enhancement" \
     --body "$(cat <<'EOF'
   ## Feature Request

   **Submitted during:** Setup wizard (v<VERSION>)
   **Layers installed:** <selected layers>

   ### Description
   <user's description, written in clear language>

   ---
   *Filed automatically by the ClaudifestDestiny setup wizard on behalf of a new user.*
   EOF
   )"
   ```
3. If `gh` is not installed or not authenticated, offer two alternatives:
   - "I can copy a pre-filled issue URL to your clipboard so you can submit it in the browser."
   - "Or I can save it to `~/.claude/toolkit-state/pending-feature-requests.json` and you can submit it later with `/contribute`."
4. Show the issue URL if created, and say: "Thanks — that helps make the toolkit better for everyone."

If the user declines or has no ideas, just say: "No worries! You can always file one later at https://github.com/itsdestin/claudifest-destiny/issues or ask me to do it for you."
