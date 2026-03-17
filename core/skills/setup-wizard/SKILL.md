---
name: setup-wizard
description: Interactive toolkit installer — inventories the user's environment, resolves conflicts, installs dependencies, personalizes templates, and verifies everything works. Invoked via /setup or when user says "set me up."
---

# DestinClaude Setup Wizard

You are the setup wizard for the DestinClaude toolkit. Walk the user through a complete installation conversationally — explaining each step in plain language. The user may be non-technical; never assume familiarity with developer tools.

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

After presenting findings, give a one-sentence plain-English summary: "I checked your computer and found [nothing existing / some existing setup to work around]."

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

Hooks are automatic behaviors — things Claude does on its own without you asking. For each hook where you already have one and the toolkit also includes one that triggers at the same point:

1. Back up the user's version: `cp ~/.claude/hooks/<name> ~/.claude/backups/pre-toolkit/<name>`
2. Explain both in plain English — what each one does automatically, not the code. For example: "Your version automatically backs up files after every change. The toolkit's version does the same thing but also syncs to Google Drive."
3. Offer three options:
   - **Merge** — combine both automatic behaviors into one (Claude handles this)
   - **Keep yours** — keep your existing behavior, skip the toolkit's version
   - **Use toolkit's** — switch to the toolkit's version (your original is backed up)
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

If any existing MCP server names match toolkit servers (e.g., `gmessages`, `imessages`, `todoist`):

1. Show the user the existing config vs. what the toolkit would set up
2. Offer: **Keep yours** / **Use toolkit's** / **Skip this server**
3. Record the choice

**After all conflicts are resolved, summarize:** "We resolved all the conflicts — your existing files are backed up safely. Here's the plan: [summary of decisions]. Ready to choose your layers?"

---

## Phase 3: Layer Selection

Present the installable layers and let the user choose.

### Step 1: Explain the layers

Tell the user:

```
DestinClaude has four layers you can install:

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
    new Claude skills, and text messaging integration (Google
    Messages for Android, or iMessage for macOS users).

  Modules (optional, pick individually)
    Specialized tools for niche use cases:
    - Elections Notebook — tracks Arizona legislative candidates
      and campaign finance data
    - JLBC Fiscal Note — drafts fiscal impact analyses for
      Arizona legislation

Which would you like?
  1. Full install (everything) (default)
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

Summarize: "You chose to install [list of selected layers]. Now I'll make sure you have everything those layers need."

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

**Note:** On macOS, the bootstrap installer already installs Homebrew before launching the setup wizard. All `brew install` commands below can be run directly without checking for Homebrew first.

### Core Dependencies

These are always checked regardless of layer selection.

#### git

```bash
git --version
```

Should already be installed (they cloned the repo). If somehow missing, this is a blocker — tell the user to install git first and restart.

#### gh CLI (strongly recommended)

```bash
gh --version
```

Tell the user: "GitHub is how the toolkit receives updates and backs up your configuration. Without it, you won't get new features or bug fixes, and your setup won't be backed up to the cloud. I'd strongly recommend setting this up — it only takes a minute. Want me to handle it for you?"

If the user agrees (or `gh` is already installed but not authenticated), proceed with installation and authentication below. If the user declines, warn them clearly: "Understood — just so you know, without GitHub you'll miss out on toolkit updates and cloud backups of your configuration. You can always set it up later by running `/setup` again."

If missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install gh` |
| Windows | `winget install GitHub.cli` |
| Linux | See https://github.com/cli/cli/blob/trunk/docs/install_linux.md |

After install, sign in to GitHub:

1. Run `gh auth login`
2. Tell the user: "This will ask a few questions in the terminal, then open your browser to sign in."
3. Walk them through each prompt:
   - **Where do you use GitHub?** → Choose "GitHub.com"
   - **Preferred protocol** → Choose "HTTPS"
   - **Authenticate** → Choose "Login with a web browser"
4. A code will appear in the terminal (like `A1B2-C3D4`). Tell the user: "Copy that code — your browser is about to open and ask for it."
5. The browser opens to GitHub. The user pastes the code, clicks Authorize, and it's done.
6. Verify: `gh auth status` — should show "Logged in to github.com"
7. If it works, confirm: "GitHub is connected. You'll get toolkit updates and cloud backups of your config."

#### gcloud CLI (optional)

```bash
gcloud --version
```

Tell the user: "Some toolkit features talk directly to Google services — like reading your Google Drive or Calendar. The Google Cloud SDK gives Claude permission to do that on your behalf. It's free and only takes a minute."

If the user wants it and it's not installed:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install --cask google-cloud-sdk` |
| Windows | `winget install Google.CloudSDK` |
| Linux | `curl https://sdk.cloud.google.com \| bash` |

**After install, walk through sign-in step by step:**

**Step 1 — Initialize gcloud:**

Run `gcloud init`. Tell the user: "This will ask you to sign in with Google. A browser window will open."

Walk them through each prompt:
- **Log in?** → Type `Y` and press Enter
- The browser opens to Google sign-in → User signs in with their Google account and clicks Allow
- Back in the terminal, it asks to pick a project → Tell the user: "You can press Enter to skip this — we don't need a Google Cloud project for what we're doing."

**Step 2 — Set up app credentials:**

Tell the user: "One more sign-in — this one lets scripts and tools use your Google account automatically, so you won't have to sign in again each time."

Run `gcloud auth application-default login`

- The browser opens again → User signs in and clicks Allow
- Terminal says "Credentials saved" → Done

**Step 3 — Verify it works:**

Run: `gcloud auth application-default print-access-token | head -c 20`

If it prints a string of characters, confirm: "Google is connected. Any toolkit feature that needs Google access will use these credentials automatically — you won't need to sign in again."

If it fails, tell the user: "That didn't work. No worries — everything else in the toolkit works without it. You can try again later by running `gcloud auth application-default login`."

Store the install status in `~/.claude/toolkit-state/config.json` under `gcloud_installed: true`.

**Usage guidance for Claude:** Whenever a toolkit skill, hook, or script needs to call a Google API directly (not through rclone or another tool with its own auth), use `gcloud auth application-default print-access-token` to get a bearer token. Example:

```bash
TOKEN=$(gcloud auth application-default print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://www.googleapis.com/drive/v3/files?q=name='example'"
```

If gcloud is not installed and a feature needs it, tell the user: "This feature needs Google API access. Run `/setup` again or install gcloud manually with `brew install --cask google-cloud-sdk` (Mac) / `winget install Google.CloudSDK` (Windows)."

### Life Dependencies

Only install if the Life layer was selected.

#### rclone

```bash
rclone --version
```

Tell the user: "Rclone is a tool that syncs files between your computer and cloud storage — like Google Drive. The toolkit uses it to back up your journal and encyclopedia files automatically."

If missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install rclone` |
| Windows | `winget install Rclone.Rclone` |
| Linux | `curl https://rclone.org/install.sh \| sudo bash` |

#### Google Drive authentication

After rclone is installed, connect it to Google Drive. Tell the user: "Now I need to connect rclone to your Google Drive. I'll walk you through it — your browser will open for you to sign in with Google."

**Do NOT run `rclone config` interactively** — it has too many confusing prompts. Instead, create the config directly:

**Step 1 — Create the config file:**

```bash
mkdir -p ~/.config/rclone
```

Check if a config already exists: `rclone listremotes`. If `gdrive:` is already listed, skip to verification.

**Step 2 — Run the targeted setup command:**

```bash
rclone config create gdrive drive
```

This will:
- Open a browser window for Google sign-in
- Ask the user to sign in and click "Allow"
- Save the credentials automatically

Tell the user: "A browser window should open. Sign in with the Google account that has the Drive you want to use, then click Allow."

If the direct command doesn't work and you need to fall back to `rclone config` (interactive mode), walk the user through it:
- **n** for new remote
- Name: **gdrive**
- Storage type: Don't ask the user to find a number in the list — it changes between versions. Instead, tell them: "Type `drive` and press Enter — that filters the list to just Google Drive." If that doesn't work, run `rclone config | grep -n "Google Drive"` in a separate terminal to find the number, then tell the user which number to type.
- **client_id** → press Enter (leave blank)
- **client_secret** → press Enter (leave blank)
- **scope** → type **1** (full access)
- **service_account_file** → press Enter (leave blank)
- **Edit advanced config?** → **n**
- **Use auto config?** → **y** (opens browser)
- After browser sign-in: **y** to confirm

If the browser doesn't open automatically (common on remote/headless Linux), rclone will print a URL and ask for a verification code. Tell the user: "Copy that URL, open it in a browser, sign in, and paste the code it gives you back here."

**Step 3 — Verify:**

```bash
rclone lsd gdrive:
```

This should print a list of folders from their Google Drive root. If it does, confirm: "Google Drive is connected! Your journal and encyclopedia files will sync here automatically."

If it fails, common fixes:
- "Did you sign in with the right Google account?" (they may have multiple)
- "Try running `rclone config delete gdrive` and we'll set it up again."

### Productivity Dependencies

Only install if the Productivity layer was selected.

#### Messaging setup

The toolkit supports two text messaging integrations. Which one to offer depends on the platform:

- **macOS users** get a choice between **iMessage** (reads the native Messages app) and **Google Messages** (for Android phones)
- **Windows and Linux users** only get **Google Messages** (iMessage requires macOS)

**Step 1 — Present the choice (macOS only):**

If the platform is macOS, ask:

```
How do you send text messages?

  1. iMessage (Apple Messages app on this Mac)
  2. Google Messages (Android phone)
  3. Both
  4. Neither — skip messaging
```

If the platform is Windows or Linux, ask:

```
Do you use Google Messages on an Android phone? The toolkit can
read and send texts through it.

  1. Yes, set it up
  2. No, skip messaging
```

Record the user's choice as `messaging_choice` in config: `"imessages"`, `"gmessages"`, `"both"`, or `"none"`.

**Step 2 — Set up iMessage (if selected or "both"):**

iMessage requires macOS and Node.js (already a toolkit dependency). No compilation or build step needed — it's a single JavaScript file.

Tell the user: "The iMessage server reads your Messages history and can send texts through the Messages app. It needs one permission to work: **Full Disk Access** for your terminal app."

Walk them through granting Full Disk Access:

1. "Open **System Settings** (click the Apple menu → System Settings)"
2. "Go to **Privacy & Security** in the sidebar"
3. "Scroll down to **Full Disk Access** and click it"
4. "Find your terminal app (Terminal, iTerm2, or whichever app you run Claude in) and toggle it **on**"
5. "You may need to restart your terminal after enabling this"

Verify it works by running a quick test:

```bash
node <toolkit_root>/productivity/mcp-servers/imessages/index.js <<< '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}' 2>/dev/null | head -1
```

If it returns a JSON response, confirm: "iMessage server is working. It can read your message history and send texts through the Messages app."

If it fails or the platform isn't macOS, tell the user: "iMessage couldn't be set up — it requires macOS with Full Disk Access enabled. You can try again later."

Store `imessages_available: true/false` in config.

**Step 3 — Set up Google Messages (if selected or "both"):**

This requires the Go compiler to build from source.

#### Go compiler

```bash
go version
```

Tell the user: "Go is a programming language. The toolkit includes a text messaging feature written in Go — I need to compile (build) it so your computer can run it. This only takes a few seconds."

If missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install go` |
| Windows | `winget install GoLang.Go` |
| Linux | Download from https://go.dev/dl/ |

After install, verify: `go version` — should print something like `go1.22.x`.

#### Build gmessages

Tell the user: "Now I'll build the text messaging server. This compiles the source code into a program your computer can run."

```bash
cd <toolkit_root>/productivity/mcp-servers/gmessages && go build -o gmessages
```

On Windows, use `go build -o gmessages.exe` instead.

Verify the binary was created:

```bash
ls -la <toolkit_root>/productivity/mcp-servers/gmessages/gmessages*
```

Store the binary path in the config:

```json
{
  "gmessages_binary": "<toolkit_root>/productivity/mcp-servers/gmessages/gmessages"
}
```

If the build fails, tell the user: "The text messaging feature couldn't be built right now — no worries, everything else will work fine. You can try again later by asking Claude to rebuild gmessages."

If the build succeeds, tell the user: "Text messaging server built. Note: you'll need to pair it with your phone later — I'll explain how when we finish setup."

#### Todoist setup

Ask the user: "Do you use Todoist? It's a task management app. If you do, I can connect Claude to it so you can manage tasks, process your inbox, and get overviews — all through conversation."

If they don't use Todoist: "No problem — skip this. You can always set it up later."

If they do use Todoist:

1. Tell them: "I need an API token — it's like a password that lets Claude talk to your Todoist account."
2. Walk them to it step by step:
   - "Open todoist.com in your browser and sign in"
   - "Click your profile picture in the top-left corner"
   - "Click **Settings**"
   - "Click **Integrations** in the left sidebar"
   - "Scroll down to **Developer** and click it"
   - "You'll see an **API token** — it's a long string of letters and numbers. Copy it and paste it here."
3. Store the token in `~/.claude/toolkit-state/config.json` under `todoist_api_token`.
4. Verify by making a test API call: `curl -s -H "Authorization: Bearer <token>" https://api.todoist.com/rest/v2/projects | head -c 100`
5. If it returns JSON data, confirm: "Todoist is connected! You can say things like 'what's on my todo list?' or 'add a task to buy groceries.'"
6. If it fails: "That token didn't work. Double-check that you copied the whole thing — it should be about 40 characters long. Try again?"

### Summary

After all dependencies are installed, show a summary:

```
Dependencies installed:
  git: v2.x.x
  gh: v2.x.x (or "skipped")
  gcloud: v4xx.x.x (or "skipped")
  rclone: v1.x.x + Google Drive connected (or "not needed")
  iMessage: ready (or "not selected" / "macOS only")
  go: v1.x.x + gmessages built (or "not selected")
  Todoist: connected (or "not needed")
```

Only show the messaging rows relevant to the user's choice.

Summarize: "All the tools you need are installed. Now let's personalize everything for you."

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

When asking about `DRIVE_ROOT`, explain what "root" means: "Where should Claude store files on your Google Drive? By 'root' I just mean a top-level folder — one of the first folders you see when you open Drive, not inside any other folder. (default: Claude)"

Example interaction:
```
What's your name? > Alex
Where should Claude store files on your Google Drive?
  ("Root" just means a top-level folder — one of the first folders you
   see when you open Drive, not inside any other folder.)
  (default: Claude) > Claude
What Todoist project should Claude use as your inbox? (default: Claude's Inbox) > My Inbox
```

Only ask about variables relevant to the selected layers. Skip `TODOIST_PROJECT` if Productivity isn't selected, skip `DRIVE_ROOT`/`JOURNAL_DIR`/`ENCYCLOPEDIA_DIR` if Life isn't selected.

When asking about `GIT_REMOTE`, if the user seems unsure or says they don't know what GitHub is, offer to explain it and help them set up a free account and repository. Frame it as: "GitHub is a free service that stores a backup of your settings online — like a safety net. Want me to walk you through setting one up? It takes about 2 minutes." If they decline, skip it gracefully.

When asking about `PERSONAL_SYNC_BACKEND`, frame the distinction clearly: "Your toolkit improvements — skills, hooks, and commands — sync to the public DestinClaude repo. That's all system-level code, nothing personal. But your memory (things Claude learns about you), your preferences, and your personal config need a private home so they're backed up and available if you switch devices."

Then present the options:
1. **Google Drive** — recommended if the user already set up rclone for the Life layer. Set `PERSONAL_SYNC_BACKEND: "drive"`.
2. **Private GitHub repo** — if the user chose this, check if `gh` is authenticated. If so, offer to create a private repo for them: `gh repo create claude-personal-data --private --clone`. Clone to `~/.claude/toolkit-state/personal-sync-repo/`, set the `personal-sync` remote, and store the URL in `PERSONAL_SYNC_REPO`. If `gh` is not available, ask for a repo URL directly.
3. **Skip for now** — set `PERSONAL_SYNC_BACKEND: "none"`. Tell them: "No problem — your data stays on this device only. You can set this up later by running `/setup` again."

Only ask `PERSONAL_SYNC_REPO` if the user chose the GitHub backend.

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
<!-- destinclaude:installed-skills:start -->
## Installed Skills
...
<!-- destinclaude:installed-skills:end -->
```

### Step 5: Register toolkit components

Claude Code auto-discovers skills from `~/.claude/skills/`, commands from `~/.claude/commands/`, and hooks from `settings.json`. Register the toolkit by symlinking its components into these standard locations — the same pattern the bootstrap installer already uses for the setup wizard.

**Important:** `enabledPlugins` in `settings.json` only works for marketplace plugins (`"name@marketplace": true`). It does NOT support local path-based registration. Always use symlinks for local toolkit components.

**Windows symlink fallback:** On Windows, `ln -sf` may fail if Developer Mode is not enabled. After each `ln -sf` call, check if the symlink resolves (`[ -e target ]`). If it doesn't, fall back to copying instead (`cp -R` for directories, `cp` for files). The bootstrap installer already does this — the wizard must match. When using copy fallback, inform the user: "Symlinks aren't available on your system — using copies instead. Everything works the same, but if you update the toolkit you'll need to re-run `/setup` to refresh these copies."

#### 5a: Symlink skills

For each selected layer, symlink every skill directory into `~/.claude/skills/`:

```bash
mkdir -p ~/.claude/skills

# Core skills (always)
ln -sf "$TOOLKIT_ROOT/core/skills/setup-wizard" ~/.claude/skills/setup-wizard

# Life skills (if Life layer selected)
for skill in encyclopedia-compile encyclopedia-interviewer encyclopedia-librarian encyclopedia-update google-drive journaling-assistant; do
  ln -sf "$TOOLKIT_ROOT/life/skills/$skill" ~/.claude/skills/$skill
done

# Productivity skills (if Productivity layer selected)
for skill in inbox-processor skill-creator; do
  ln -sf "$TOOLKIT_ROOT/productivity/skills/$skill" ~/.claude/skills/$skill
done

# Module skills (if individual modules selected)
# Elections Notebook:
ln -sf "$TOOLKIT_ROOT/modules/elections-notebook/skills/elections-notebook" ~/.claude/skills/elections-notebook
# JLBC Fiscal Note:
ln -sf "$TOOLKIT_ROOT/modules/jlbc-fiscal-note/skills/jlbc-fiscal-note" ~/.claude/skills/jlbc-fiscal-note
```

Only run the blocks for layers the user selected in Phase 3.

#### 5b: Symlink commands

```bash
mkdir -p ~/.claude/commands

# Core commands (always)
for cmd in setup.md contribute.md toolkit.md toolkit-uninstall.md update.md health.md; do
  ln -sf "$TOOLKIT_ROOT/core/commands/$cmd" ~/.claude/commands/$cmd
done
```

#### 5c: Symlink hooks

```bash
mkdir -p ~/.claude/hooks

# Core hooks (always — skip any the user chose to "keep yours" in Phase 2)
# NOTE: statusline.sh is NOT a hook — it's configured separately via settings.json "statusLine"
for hook in checklist-reminder.sh git-sync.sh session-start.sh title-update.sh todo-capture.sh write-guard.sh; do
  ln -sf "$TOOLKIT_ROOT/core/hooks/$hook" ~/.claude/hooks/$hook
done

# Statusline script — symlink to ~/.claude/ (not hooks/)
ln -sf "$TOOLKIT_ROOT/core/hooks/statusline.sh" ~/.claude/statusline.sh

# Life hooks (if Life layer selected)
ln -sf "$TOOLKIT_ROOT/life/hooks/sync-encyclopedia.sh" ~/.claude/hooks/sync-encyclopedia.sh
```

#### 5d: Register hooks in settings.json

Hooks must also be registered in `~/.claude/settings.json` under the `hooks` key so Claude Code invokes them at the right trigger points. Read the existing `settings.json` (create it if missing), then merge the toolkit's hook registrations into the `hooks` object. Preserve any existing hook entries the user chose to keep in Phase 2.

Refer to the hook scripts themselves for the correct trigger point (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`) and matcher pattern for each hook.

#### 5d-ii: Register the statusline

The statusline is NOT a hook — it's a separate config entry in `settings.json`. Add this top-level key:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash ~/.claude/statusline.sh"
  }
}
```

This tells Claude Code to run the statusline script and display its output at the bottom of the terminal. The script shows sync status, model name, remaining context percentage, and toolkit version.

#### 5e: Verify symlinks

After creating all symlinks, verify each one resolves correctly:

```bash
for link in ~/.claude/skills/*/SKILL.md; do
  if [ ! -e "$link" ]; then
    echo "BROKEN: $link"
  fi
done
```

If any symlinks are broken (target doesn't exist), report them to the user and offer to retry. Common causes: the toolkit was moved after cloning, or a layer directory is missing.

After verification, confirm: "Toolkit registered — all skills, commands, and hooks are linked. From now on just run `claude` and everything loads automatically."

### Step 6: Configure MCP servers (if applicable)

MCP servers let Claude talk to external services. They're configured in `~/.claude.json` — read the file first (it may have existing settings to preserve), then add entries under the `mcpServers` key.

Tell the user: "Now I'll register the services we set up so Claude can use them automatically in every conversation."

**windows-control** (Windows only):

The windows-control MCP server lets Claude interact with the Windows desktop — clicking, typing, taking screenshots, managing windows. It's installed via `uvx` (part of `uv`, the Python package runner). Add this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "windows-control": {
      "type": "stdio",
      "command": "uvx",
      "args": ["windows-mcp"],
      "env": {}
    }
  }
}
```

If `uvx` is not installed, install it first: `pip install uv` or `pipx install uv`.

Tell the user: "Windows desktop control is registered. Claude can now interact with windows, click buttons, take screenshots, and automate desktop tasks."

**Todoist** (if Productivity selected and Todoist token provided):

The Todoist MCP server is a cloud-hosted service — no local binary needed. Add this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "todoist": {
      "type": "http",
      "url": "https://ai.todoist.net/mcp"
    }
  }
}
```

Note: The Todoist MCP server handles authentication through its own OAuth flow when Claude first connects — the API token collected earlier is a fallback for direct API calls, not for MCP.

**imessages** (if Productivity selected, macOS, and `messaging_choice` is `"imessages"` or `"both"`):

The imessages MCP server is a local Node.js script — no build step needed. Add this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "imessages": {
      "type": "stdio",
      "command": "node",
      "args": ["<toolkit_root>/productivity/mcp-servers/imessages/index.js"]
    }
  }
}
```

Replace `<toolkit_root>` with the actual path.

Tell the user: "iMessage is registered. Claude can now read your message history and send texts through the Messages app. Make sure Full Disk Access stays enabled for your terminal."

**gmessages** (if Productivity selected, build succeeded, and `messaging_choice` is `"gmessages"` or `"both"`):

The gmessages MCP server is a local program that Claude runs on your computer. Add this to `~/.claude.json`, using the platform-appropriate binary name:

- **macOS/Linux:** `gmessages`
- **Windows:** `gmessages.exe`

```json
{
  "mcpServers": {
    "gmessages": {
      "type": "stdio",
      "command": "<toolkit_root>/productivity/mcp-servers/gmessages/gmessages<.exe on Windows>",
      "args": []
    }
  }
}
```

Replace `<toolkit_root>` with the actual path (e.g., `~/.claude/plugins/destinclaude`). On Windows, use `gmessages.exe`.

Tell the user: "The text messaging server is registered. To pair it with your phone, you'll need to scan a QR code — ask Claude 'help me set up Google Messages' in a future session and it will walk you through it."

**Important:** When merging into `~/.claude.json`, preserve ALL existing content. The file contains Claude Code's own settings — only add or update the `mcpServers` entries. Never overwrite the rest of the file.

After configuring, show the user what was set up:

```
MCP servers configured:
  Todoist ..................... Connected (cloud)
  imessages .................. Registered (local — macOS Messages)
  gmessages .................. Registered (local — pair phone later)
```

Only show the messaging servers the user actually selected. For example, if they chose iMessage only, don't show gmessages.

Summarize: "Everything is personalized for you — your name, preferences, and services are all configured."

---

## Phase 6: Verification

Run a health check on everything that was installed.

### Step 1: Core checks

- [ ] `git --version` returns successfully
- [ ] Toolkit root directory exists and contains `VERSION`
- [ ] `~/.claude/CLAUDE.md` exists and contains toolkit sections
- [ ] Hook scripts in `core/hooks/` are present and executable
- [ ] All expected symlinks in `~/.claude/skills/` resolve (not broken)
- [ ] All expected symlinks in `~/.claude/commands/` resolve (not broken)
- [ ] Hooks are registered in `~/.claude/settings.json` under the `hooks` key
- [ ] `statusLine` is configured in `~/.claude/settings.json` (separate from hooks)
- [ ] `~/.claude/statusline.sh` exists and resolves (not a broken symlink)

### Step 2: Life checks (if installed)

- [ ] `rclone lsd gdrive:` returns successfully (Google Drive connected)
- [ ] Encyclopedia template files exist in `~/.claude/<ENCYCLOPEDIA_DIR>/`
- [ ] Journal directory exists or can be created at `~/.claude/<JOURNAL_DIR>/`

### Step 3: Productivity checks (if installed)

- [ ] imessages server responds to initialize (if iMessage was selected and macOS)
- [ ] gmessages binary exists (if Google Messages was selected and Go was available)
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
  imessages ready ...................... OK
  gmessages built ...................... OK
  Todoist connected .................... OK
```

If anything failed, show: "These items need attention:" with specific guidance on how to fix each one. Offer to retry the failed items.

### Step 5: Completion message

```
All systems check out — you're good to go!

Setup complete! Here's what's installed:

  Layers: Core, Life, Productivity
  Skills: journaling-assistant, encyclopedia-*, inbox-processor, skill-creator
  Hooks: 8 active hooks for file protection and sync
  MCP servers: Todoist, imessages, gmessages (varies by selection)
```

Save the final config state to `~/.claude/toolkit-state/config.json` with `setup_completed: true` and `setup_completed_at: <ISO timestamp>`.

### Step 6: First-run guided experience

After the completion summary, give the user a concrete next action instead of a wall of features. Show:

```
Want to try something right now?

  1. "Let's journal" — write your first journal entry
  2. "Check my inbox" — see if there's anything waiting
  3. I'll explore on my own

(Tip: type /toolkit anytime to see all your features and useful phrases)
```

Only show options for installed layers (e.g., don't show "Let's journal" if Life isn't installed, don't show "Check my inbox" if Productivity isn't installed). If the user picks option 3 or just wants to explore, show the full `/toolkit` reference card.

Do NOT ask the user for feature requests, feedback, or contributions at this point — they just finished a long setup. Let them explore.
