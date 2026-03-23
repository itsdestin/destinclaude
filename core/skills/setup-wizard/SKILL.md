---
name: setup-wizard
description: Interactive toolkit installer — inventories the user's environment, resolves conflicts, installs dependencies, personalizes templates, and verifies everything works. Invoked via /setup-wizard or when user says "set me up."
---

# DestinClaude Setup Wizard

You are the setup wizard for the DestinClaude toolkit. Walk the user through a complete installation conversationally — explaining each step in plain language. The user may be non-technical; never assume familiarity with developer tools.

**Golden rule:** This wizard is **additive and non-destructive**. Never overwrite, delete, or modify existing user files without explicit permission. Always back up before changing anything.

**Runtime variables:** Throughout this process, collect configuration values and store them in `~/.claude/toolkit-state/config.json`. Create the directory if it doesn't exist.

---

## Phase 0: Prior Use Check

Before inventorying the environment, find out if this is a fresh install or a restore.

### Step 1: Ask the prior-use question

Say exactly:

```
Before we get started — have you used DestinClaude before on another device?

  1. Yes — I have a backup to restore from
  2. No — this is my first time
```

If the user answers **2 (no)** or indicates they're new, proceed to **Phase 0.5**.

If the user answers **1 (yes)** or indicates prior use, continue to Step 2.

(The user may answer in plain language — treat any affirmative as option 1, any negative as option 2.)

**Wait for the user's answer before proceeding.**

### Step 2: Ask which backup source

Say exactly:

```
Where did you back up your data?

  1. GitHub (private config repo)
  2. Google Drive
  3. iCloud
  4. Not sure / skip
```

- **1 (GitHub):** Proceed to **Phase 0A: GitHub Restore**.
- **2 (Google Drive):** Proceed to **Phase 0B: Drive Restore**.
- **3 (iCloud):** Say "iCloud restore support is coming — for now, let's do a fresh install. I'll make sure everything is set up to back up to iCloud going forward." Then proceed to Phase 1 normally.
- **4 (not sure / skip):** Proceed to Phase 1 normally.

**Wait for the user's answer before proceeding.**

---

## Phase 0A: GitHub Restore

### Step 1: Get the repo URL

Ask: "What's the URL of your private config repo? It should look like `https://github.com/yourusername/your-repo-name.git`"

### Step 2: Ensure git is installed

```bash
git --version
```

If missing, this is a blocker. Tell the user: "Git isn't installed yet — I need it to clone your backup. Let me install it first." Use the platform-appropriate install command from Phase 4 (Core Dependencies → git), then verify.

### Step 3: Clone or pull

Check whether `~/.claude` is already a git repo:

```bash
[ -d "$HOME/.claude/.git" ] && echo "exists" || echo "missing"
```

If **missing** — clone:

```bash
git clone <repo-url> ~/.claude
```

If **exists** — pull:

```bash
cd ~/.claude && git pull --rebase origin main
```

If either fails, tell the user what went wrong (wrong URL, no access, no internet) and ask them to check the URL and try again.

### Step 4: Rewrite hardcoded paths

The backup may contain paths from the original machine. Detect the current machine's HOME and project slug, then replace any old values found in the cloned files:

```bash
NORM_HOME="${HOME//\\//}"
CURRENT_SLUG=$(echo "$NORM_HOME" | sed 's|[/:]|-|g; s|^-||')

# Detect old HOME from cloned files
OLD_HOME=$(grep -rh "C:/Users/[^/\"' ]*\|/Users/[^/\"' ]*\|/home/[^/\"' ]*" \
  ~/.claude/CLAUDE.md ~/.claude/settings.json 2>/dev/null \
  | grep -o "C:/Users/[^/\"' ]*\|/Users/[^/\"' ]*\|/home/[^/\"' ]*" \
  | head -1)
OLD_SLUG=$(echo "$OLD_HOME" | sed 's|[/:]|-|g; s|^-||')

if [[ -n "$OLD_HOME" && "$OLD_HOME" != "$NORM_HOME" ]]; then
    find ~/.claude -type f \( -name "*.md" -o -name "*.sh" -o -name "*.json" \) \
        -not -path "*/.git/*" -not -path "*/node_modules/*" \
        -exec grep -l "$OLD_HOME" {} \; | while read -r file; do
        sed "s|$OLD_HOME|$NORM_HOME|g" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    done
    echo "  Updated path references: $OLD_HOME → $NORM_HOME"
fi

if [[ -n "$OLD_SLUG" && "$OLD_SLUG" != "$CURRENT_SLUG" ]]; then
    find ~/.claude -type f \( -name "*.md" -o -name "*.sh" -o -name "*.json" \) \
        -not -path "*/.git/*" -not -path "*/node_modules/*" \
        -exec grep -l "$OLD_SLUG" {} \; | while read -r file; do
        sed "s|$OLD_SLUG|$CURRENT_SLUG|g" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    done
    echo "  Updated slug references: $OLD_SLUG → $CURRENT_SLUG"
fi
```

Tell the user: "I've updated any references to your old device's username."

### Step 5: Apply MCP server config

If `~/.claude/mcp-servers/mcp-config.json` exists and `node` is available, merge it back into `~/.claude.json`:

```bash
if [[ -f "$HOME/.claude/mcp-servers/mcp-config.json" ]] && command -v node &>/dev/null; then
    NORM_HOME="${HOME//\\//}"
    node -e "
        const fs = require('fs');
        const mcpConfig = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        if (Object.keys(mcpConfig).length === 0) { process.exit(0); }
        const cjPath = process.argv[2];
        const projectKey = process.argv[3];
        let cj = {};
        try { cj = JSON.parse(fs.readFileSync(cjPath, 'utf8')); } catch(e) {}
        if (!cj.projects) cj.projects = {};
        if (!cj.projects[projectKey]) cj.projects[projectKey] = {};
        cj.projects[projectKey].mcpServers = mcpConfig;
        fs.writeFileSync(cjPath, JSON.stringify(cj, null, 2) + '\n');
        console.log('  Applied ' + Object.keys(mcpConfig).length + ' MCP server(s).');
    " "$HOME/.claude/mcp-servers/mcp-config.json" "$HOME/.claude.json" "$NORM_HOME"
fi
```

If node isn't available yet, skip this step and tell the user: "I'll re-apply your MCP server config once Node.js is confirmed installed."

### Step 6: Confirm and continue

Tell the user: "Your config is restored from GitHub. Now let me confirm all the tools it needs are installed on this machine."

Proceed to **Phase 0C: Abbreviated Dependency Check**.

---

## Phase 0B: Drive Restore

### Step 1: Install rclone if missing

Follow the exact same rclone installation steps as **Phase 4 → Life Dependencies → rclone** — same explanation, same platform commands, same verification (`rclone --version`).

### Step 2: Configure Google Drive

Follow the exact same Google Drive authentication steps as **Phase 4 → Life Dependencies → Google Drive authentication** — same walkthrough, same `rclone config create gdrive drive` command, same verification (`rclone lsd gdrive:`).

If `gdrive:` is already listed in `rclone listremotes`, skip setup and go straight to Step 3.

### Step 3: Ask for Drive root

Ask: "Where does DestinClaude store files on your Google Drive? This is the top-level folder name. (default: Claude)"

Store the answer as `DRIVE_ROOT`. Use `Claude` if the user presses Enter without answering.

### Step 4: Pull data from Drive

Pull in this order. Tell the user what's happening at each step.

**Encyclopedia files:**

```bash
mkdir -p ~/.claude/encyclopedia
rclone sync "gdrive:$DRIVE_ROOT/The Journal/System/" ~/.claude/encyclopedia/ 2>/dev/null \
  && echo "  Encyclopedia synced." \
  || echo "  WARNING: Encyclopedia sync failed. Run manually: rclone sync 'gdrive:$DRIVE_ROOT/The Journal/System/' ~/.claude/encyclopedia/"
```

**Personal data** (memory, CLAUDE.md, toolkit config):

```bash
rclone sync "gdrive:$DRIVE_ROOT/Backup/personal/" ~/.claude/ --update 2>/dev/null \
  && echo "  Personal data synced." \
  || echo "  WARNING: Personal data sync failed. Run manually: rclone sync 'gdrive:$DRIVE_ROOT/Backup/personal/' ~/.claude/ --update"
```

**Conversation transcripts:**

```bash
mkdir -p ~/.claude/projects
rclone copy "gdrive:$DRIVE_ROOT/Backup/conversations/" ~/.claude/projects/ --size-only 2>/dev/null \
  && echo "  Transcripts synced." \
  || echo "  WARNING: Transcript sync failed. Run manually: rclone copy 'gdrive:$DRIVE_ROOT/Backup/conversations/' ~/.claude/projects/ --size-only"
```

If any step fails and the user wants to skip it, that's fine — tell them the manual command to run later.

### Step 5: Confirm and continue

Tell the user: "Your data is restored from Google Drive. Now let me confirm all the tools it needs are installed on this machine."

Proceed to **Phase 0C: Abbreviated Dependency Check**.

---

## Phase 0C: Abbreviated Dependency Check

*Used only after Phase 0A or 0B. Skip this section for fresh installs — they use Phase 4.*

Tell the user: "Let me make sure all the tools your restored config needs are installed on this machine."

Read `~/.claude/toolkit-state/config.json` to determine which layers were previously installed (`installed_layers`).

If `config.json` exists but does not contain a `comfort_level` key (backups from before this feature), default to `"intermediate"` and store it in working state. Do not ask the user — this preserves the pre-comfort-gate behavior. The user can change it on a future re-run of `/setup-wizard`.

Run the dependency checks from **Phase 4** for each relevant layer:

- Always run **Core Dependencies** checks (git, gh CLI, gcloud)
- Run **Life Dependencies** checks (rclone, Google Drive) only if `"life"` is in `installed_layers` — or if Phase 0B just ran (rclone is already configured)
- Run **Productivity Dependencies** checks (messaging, Go, Todoist) only if `"productivity"` is in `installed_layers`

For each dependency:
- If already installed: report ✓ and skip
- If missing: explain what it is and install it using the same steps as Phase 4

If `toolkit-state/config.json` doesn't exist or can't be read, run all Core checks and ask the user which layers they had installed.

After completing all checks:

Tell the user: "Since your config is restored from backup, I'll skip the personalization step — your name, preferences, and settings are already in place. Let me just verify everything works."

**Skip Phase 1 through Phase 5 entirely.** Proceed directly to **Phase 6: Verification**.

---

## Phase 0.5: Comfort Level

*Only for fresh installs. If the user restored from backup (Phase 0A/0B → 0C), this phase was skipped — proceed to Phase 6 as directed by Phase 0C.*

*If this is a re-run and `~/.claude/toolkit-state/config.json` already has a `comfort_level`, pre-select it:* "Last time you chose [beginner/intermediate/power user]. Still feel the same, or want to change?"

*Otherwise, say exactly:*

```
How comfortable are you with this terminal and Claude Code?

  1. I have no idea what I'm doing and I'm scared
     → Full guided setup with detailed explanations at every step

  2. I know what I'm doing, but walk me through linking my accounts
     → Full setup wizard, standard pacing

  3. I really don't need any setup help
     → Speed run — defaults where possible, only asks what it has to
```

(The user may answer in plain language — "I'm terrified" maps to 1, "just set it up" maps to 3, etc.)

**Wait for the user's answer before proceeding.**

### Step 1: Store comfort level

Map the answer to a comfort level and store in working state:

- Option 1 → `"beginner"`
- Option 2 → `"intermediate"`
- Option 3 → `"power_user"`

### Step 2: Activate output style immediately

Read `~/.claude/settings.json` (create it if it doesn't exist). Merge the output style plugins into `enabledPlugins` based on comfort level:

**Beginner:**
```json
{
  "enabledPlugins": {
    "explanatory-output-style@claude-plugins-official": true,
    "learning-output-style@claude-plugins-official": false
  }
}
```

**Intermediate:**
```json
{
  "enabledPlugins": {
    "explanatory-output-style@claude-plugins-official": true,
    "learning-output-style@claude-plugins-official": true
  }
}
```

**Power User:**
```json
{
  "enabledPlugins": {
    "explanatory-output-style@claude-plugins-official": true,
    "learning-output-style@claude-plugins-official": true
  }
}
```

On re-runs where the user is re-choosing, overwrite the existing output style values rather than skipping them.

Preserve all other existing content in `settings.json`. Only add or update the two output style entries.

### Step 3: Persist to config

Write `comfort_level` to `~/.claude/toolkit-state/config.json` (create the file/directory if needed). This goes alongside the other top-level keys (`platform`, `toolkit_root`, etc.).

**Proceed to Phase 1.**

---

## Phase 1: Environment Inventory

Before installing anything, understand what's already on the user's system.

> **Comfort-level adaptation:**
> - **Beginner:** After presenting findings in Step 4, add plain-language explanations of what each item means (e.g., "Skills are like specialized instructions that teach Claude how to do specific things").
> - **Intermediate:** No change — present findings normally.
> - **Power user:** Run Steps 1–3 silently. Only present Step 4 findings if conflicts are detected. If no conflicts, say: "Clean slate — moving on." and proceed without waiting for acknowledgment.

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

> **Comfort-level adaptation:**
> - **Beginner:** For each conflict, explain what it means and why it matters in plain language. Recommend a safe default for each conflict and explain why it's safe.
> - **Intermediate:** No change.
> - **Power user:** If no conflicts exist, skip Phase 2 entirely without mentioning it. If conflicts exist, present them tersely in a table format and ask for resolution.

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

If any existing MCP server names match toolkit servers (e.g., `gmessages`, `imessages`, `todoist`, `macos-automator`, `home-mcp`, `apple-events`):

1. Show the user the existing config vs. what the toolkit would set up
2. Offer: **Keep yours** / **Use toolkit's** / **Skip this server**
3. Record the choice

**After all conflicts are resolved, summarize:** "We resolved all the conflicts — your existing files are backed up safely. Here's the plan: [summary of decisions]. Ready to choose your layers?"

---

## Phase 3: Layer Selection

Present the installable layers and let the user choose.

> **Comfort-level adaptation:**
> - **Beginner:** Keep the full layer explanations. After presenting, recommend: "If you're not sure, I'd suggest the full install — you can always remove things later."
> - **Intermediate:** No change.
> - **Power user:** Skip the layer explanation block. Instead say: "Installing all layers (Core, Life, Productivity). Good?" If the user confirms, proceed. If they want to customize, fall back to option 4 (individual selection) without the explanatory text.

### Step 1: Explain the layers

Tell the user:

```
DestinClaude has three layers you can install:

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

Modules are optional domain-specific add-ons. Available modules
will be listed during setup.

Which would you like?
  1. Full install (everything) (default)
  2. Core + Life + Productivity
  3. Core only (just the basics)
  4. Let me pick individually
```

### Step 2: Handle individual selection

If the user picks option 4, walk through each layer, asking yes/no.

### Step 3: Record selections

Store the selected layers in `~/.claude/toolkit-state/config.json`:

```json
{
  "platform": "<detected>",
  "toolkit_root": "<path>",
  "installed_layers": ["core", "life", "productivity"],
  "installed_modules": [],
  "conflict_resolutions": { ... },
  "installed_at": "<ISO timestamp>"
}
```

Summarize: "You chose to install [list of selected layers]. Now I'll make sure you have everything those layers need."

**Proceed to Phase 4.**

---

## Phase 4: Dependency Installation

Install external tools required by the selected layers. For each dependency, follow this pattern:

> **Comfort-level adaptation:**
> - **Beginner:** Before installing each tool, explain what it is and why the toolkit needs it (e.g., "Git is a tool that tracks changes to files — like an undo history for your whole computer").
> - **Intermediate:** No change.
> - **Power user:** Install all dependencies silently. After all installs complete, show a single summary table of what was installed and its status (OK / already installed / FAILED). Only pause for user input if something fails.

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

If the user agrees (or `gh` is already installed but not authenticated), proceed with installation and authentication below. If the user declines, warn them clearly: "Understood — just so you know, without GitHub you'll miss out on toolkit updates and cloud backups of your configuration. You can always set it up later by running `/setup-wizard` again."

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

If gcloud is not installed and a feature needs it, tell the user: "This feature needs Google API access. Run `/setup-wizard` again or install gcloud manually with `brew install --cask google-cloud-sdk` (Mac) / `winget install Google.CloudSDK` (Windows)."

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

#### gmessages binary

**On Windows:** The toolkit ships with a pre-built `gmessages.exe` — no Go compiler needed. Check if it's already present:

```bash
ls <toolkit_root>/productivity/mcp-servers/gmessages/gmessages.exe
```

If it exists, tell the user: "Good news — the text messaging server is already included for Windows. No build needed." Store the binary path and skip to Todoist setup:

```json
{
  "gmessages_binary": "<toolkit_root>/productivity/mcp-servers/gmessages/gmessages.exe"
}
```

**On macOS/Linux (or if the Windows binary is missing):** Build from source using the Go compiler.

```bash
go version
```

Tell the user: "Go is a programming language. The toolkit includes a text messaging feature written in Go — I need to compile (build) it so your computer can run it. This only takes a few seconds."

If Go is missing:

| Platform | Install command |
|----------|----------------|
| macOS | `brew install go` |
| Linux | Download from https://go.dev/dl/ |

After install, verify: `go version` — should print something like `go1.22.x`.

Build the server:

```bash
cd <toolkit_root>/productivity/mcp-servers/gmessages && go build -o gmessages
```

Verify the binary was created:

```bash
ls -la <toolkit_root>/productivity/mcp-servers/gmessages/gmessages
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
3. The Todoist MCP server handles authentication through its own OAuth flow when Claude first connects — no API token is needed.
4. Confirm: "Todoist will be connected via MCP! You can say things like 'what's on my todo list?' or 'add a task to buy groceries.'"

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

> **Comfort-level adaptation:**
> - **Beginner:** Keep all explanatory framing for template variable questions (the "by 'root' I just mean..." style). When asking about `GIT_REMOTE` and `PERSONAL_SYNC_BACKEND`, keep the full tutorial offers and plain-language explanations.
> - **Intermediate:** No change (this is the current behavior).
> - **Power user:** Strip all explanatory framing from template variable questions — ask them rapid-fire with just the variable name and default. Skip the GitHub/sync tutorial offers (just ask the raw question). Example: "Google Drive root folder? (default: Claude)" instead of the multi-line explanation.

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
3. **Skip for now** — set `PERSONAL_SYNC_BACKEND: "none"`. Tell them: "No problem — your data stays on this device only. You can set this up later by running `/setup-wizard` again."

Only ask `PERSONAL_SYNC_REPO` if the user chose the GitHub backend.

### Step 2: Process template files

For each file listed in a variable's `used_in` array (and that belongs to an installed layer):

1. Read the file
2. Replace all `{{VARIABLE_NAME}}` placeholders with the user's values
3. Write the processed file back

### Step 3: Install encyclopedia starter templates (if Life layer selected)

**Skip this step entirely if a restore was performed in Phase 0** — encyclopedia files were pulled from backup and already exist. For fresh installs only: Copy the starter templates from `<toolkit_root>/life/templates/` to the user's local encyclopedia directory (`~/.claude/<ENCYCLOPEDIA_DIR>/`):

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

**Windows symlinks:** On Windows, symlinks require Developer Mode (enabled by the bootstrap installer) and Git Bash must have `MSYS=winsymlinks:nativestrict` set. Before creating symlinks on Windows, run `export MSYS=winsymlinks:nativestrict` to ensure `ln -sf` creates real Windows symlinks instead of copies. If symlink creation fails, do NOT fall back to copying — instead, tell the user: "Symlink creation failed. Developer Mode must be enabled (Settings > System > For Developers) and you must be using Git Bash. Please fix this and re-run /setup-wizard." Copy-based installs are no longer supported because they cause file drift that breaks updates.

#### 5a: Symlink skills

For each selected layer, symlink every skill directory into `~/.claude/skills/`:

```bash
# On Windows, ensure real symlinks (not MSYS copies)
[[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && export MSYS=winsymlinks:nativestrict

mkdir -p ~/.claude/skills

# Core skills (always)
ln -sf "$TOOLKIT_ROOT/core/skills/setup-wizard" ~/.claude/skills/setup-wizard

# Life skills (if Life layer selected)
for skill in encyclopedia-compile encyclopedia-interviewer encyclopedia-librarian encyclopedia-update fork-file google-drive journaling-assistant; do
  ln -sf "$TOOLKIT_ROOT/life/skills/$skill" ~/.claude/skills/$skill
done

# Productivity skills (if Productivity layer selected)
for skill in inbox-processor skill-creator; do
  ln -sf "$TOOLKIT_ROOT/productivity/skills/$skill" ~/.claude/skills/$skill
done
```

Only run the blocks for layers the user selected in Phase 3.

#### 5b: Symlink commands

```bash
mkdir -p ~/.claude/commands

# Core commands (always)
for cmd in setup-wizard.md contribute.md toolkit.md toolkit-uninstall.md update.md health.md; do
  ln -sf "$TOOLKIT_ROOT/core/commands/$cmd" ~/.claude/commands/$cmd
done
```

#### 5c: Symlink hooks

```bash
mkdir -p ~/.claude/hooks

# Core hooks (always — skip any the user chose to "keep yours" in Phase 2)
# NOTE: statusline.sh is NOT a hook — it's configured separately via settings.json "statusLine"
for hook in checklist-reminder.sh contribution-detector.sh done-sound.sh git-sync.sh personal-sync.sh session-start.sh title-update.sh todo-capture.sh tool-router.sh write-guard.sh; do
  ln -sf "$TOOLKIT_ROOT/core/hooks/$hook" ~/.claude/hooks/$hook
done

# Utility scripts called by hooks (must be findable as siblings)
for util in announcement-fetch.js usage-fetch.js; do
  ln -sf "$TOOLKIT_ROOT/core/hooks/$util" ~/.claude/hooks/$util
done

# Statusline script — symlink to ~/.claude/ (not hooks/)
ln -sf "$TOOLKIT_ROOT/core/hooks/statusline.sh" ~/.claude/statusline.sh

# Life hooks (if Life layer selected)
ln -sf "$TOOLKIT_ROOT/life/hooks/sync-encyclopedia.sh" ~/.claude/hooks/sync-encyclopedia.sh
```

#### 5d: Register hooks in settings.json

Hooks must also be registered in `~/.claude/settings.json` under the `hooks` key so Claude Code invokes them at the right trigger points. Read the existing `settings.json` (create it if missing), then merge the toolkit's hook registrations into the `hooks` object. Preserve any existing hook entries the user chose to keep in Phase 2.

**IMPORTANT — Hook schema:** Each hook entry MUST use the nested `hooks` array format. The `command` property goes inside a `hooks` array on each entry, NOT directly on the entry object. Here is the exact schema to generate:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/session-start.sh" }]
      },
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/contribution-detector.sh" }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/todo-capture.sh" }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/write-guard.sh" }]
      },
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/tool-router.sh" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/git-sync.sh" }]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/personal-sync.sh" }]
      },
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/title-update.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/checklist-reminder.sh" }]
      },
      {
        "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/done-sound.sh" }]
      }
    ]
  }
}
```

**Wrong format (will cause "Expected array, but received undefined" errors):**
```json
{ "command": "bash ~/.claude/hooks/foo.sh" }
```

**Correct format:**
```json
{ "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/foo.sh" }] }
```

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

#### 5f: Register marketplace plugins

Marketplace plugins extend Claude Code with additional skills and tools. They're registered via `enabledPlugins` in `~/.claude/settings.json` — distinct from the symlink-based local toolkit components.

Read the existing `~/.claude/settings.json`, then merge the following entries into the `enabledPlugins` object. Preserve any existing entries the user already has.

```json
{
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "code-review@claude-plugins-official": true,
    "code-simplifier@claude-plugins-official": true,
    "commit-commands@claude-plugins-official": true,
    "feature-dev@claude-plugins-official": true,
    "hookify@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "explanatory-output-style@claude-plugins-official": true,
    "learning-output-style@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "linear@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "plugin-dev@claude-plugins-official": true
  }
}
```

**Important:** These plugins are downloaded automatically by Claude Code on first use — no manual install step needed. If a plugin is already present in `enabledPlugins` (key exists, regardless of whether value is `true` or `false`), skip it — don't overwrite the existing value. This is critical for the output style plugins, which were already set by Phase 0.5 based on the user's comfort level. (Phase 0.5 handles the re-run/re-choice case by overwriting before Phase 5f runs.)

After registering, tell the user: "I've registered 14 recommended plugins. They'll download automatically the first time you use them."

### Step 6: Configure MCP servers (if applicable)

MCP servers let Claude talk to external services. They're configured in `~/.claude.json` — read the file first (it may have existing settings to preserve), then add entries under the `mcpServers` key.

Tell the user: "Now I'll register the services we set up so Claude can use them automatically in every conversation."

#### Auto-registering platform MCPs

Read `<toolkit_root>/core/mcp-manifest.json`. For each entry where `"auto": true` and `platform` matches the current platform (or `"platform": "all"`):

1. Check if it's already registered in `~/.claude.json` — skip if so
2. Build the config object from the manifest entry (`type`, `command`, `args`, `env`, `url` as applicable)
3. Replace any `{{toolkit_root}}` placeholders with the actual toolkit root path
4. On Windows, use `command_windows` instead of `command` if present
5. Merge into `~/.claude.json` under `mcpServers`

After registering all auto MCPs, tell the user which were added:

```
Registered platform MCPs:
  macos-automator ........ AppleScript + JXA Mac automation
  home-mcp ............... HomeKit device control
  apple-events ........... Native Reminders + Calendar
```

(shows only the MCPs relevant to the detected platform — Windows users see `windows-control` instead)

**Important:** When merging into `~/.claude.json`, preserve ALL existing content. Only add or update the `mcpServers` entries.
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

Note: The Todoist MCP server handles authentication through its own OAuth flow when Claude first connects.

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

## Phase 5b: DestinCode Desktop App (Optional)

Offer to install the DestinCode desktop app — a GUI for Claude Code with chat view, tool cards, session management, and status monitoring.

> **Comfort-level adaptation:**
> - **Beginner:** Explain what the desktop app provides: "Instead of using Claude Code in a terminal, you can use a desktop app with a visual chat interface, clickable tool approvals, and session tabs."
> - **Intermediate:** Brief description: "DestinCode is an optional GUI for Claude Code."
> - **Power user:** One-liner: "Install DestinCode desktop app?"

Ask: "Would you like to install the DestinCode desktop app?"

If yes:

1. Run the install script:
```bash
bash "$TOOLKIT_ROOT/desktop/scripts/install-app.sh"
```

2. If the script fails (e.g., no release found for this version), inform the user:
   - "The desktop app isn't available for this version yet. You can install it later by running: `bash ~/.claude/plugins/destinclaude/desktop/scripts/install-app.sh`"

3. If successful, the script prints launch instructions for their platform.

If no, skip — they can always install later.

---

## Phase 6: Verification

Run a health check on everything that was installed.

> **Comfort-level adaptation:**
> - **Beginner:** Celebrate warmly. If any check fails, explain what it means and what went wrong in plain language before offering to fix it.
> - **Intermediate:** No change.
> - **Power user:** Show results as a compact pass/fail table with no narration. Only provide detail for items that fail.

### Step 1: Core checks

- [ ] `git --version` returns successfully
- [ ] Toolkit root directory exists and contains `VERSION`
- [ ] `~/.claude/CLAUDE.md` exists and contains toolkit sections
- [ ] Hook scripts in `core/hooks/` are present and executable
- [ ] All expected entries in `~/.claude/skills/` are real symlinks (not copies) and resolve
- [ ] All expected entries in `~/.claude/commands/` are real symlinks (not copies) and resolve
- [ ] All expected entries in `~/.claude/hooks/` are real symlinks (not copies) and resolve
- [ ] Hooks are registered in `~/.claude/settings.json` under the `hooks` key
- [ ] `statusLine` is configured in `~/.claude/settings.json` (separate from hooks)
- [ ] `~/.claude/statusline.sh` is a real symlink (not a copy) and resolves
- [ ] All 14 marketplace plugin keys present in `~/.claude/settings.json` `enabledPlugins` (keys may be `true` or `false` — both count as present; beginners will have `learning-output-style` set to `false`)

### Step 2: Life checks (if installed)

- [ ] `rclone lsd gdrive:` returns successfully (Google Drive connected)
- [ ] Encyclopedia template files exist in `~/.claude/<ENCYCLOPEDIA_DIR>/`
- [ ] Journal directory exists or can be created at `~/.claude/<JOURNAL_DIR>/`

### Step 3: Productivity checks (if installed)

Use the MCP initialize handshake to verify each server can actually start and speak MCP — not just that it's registered or that the binary exists. Use this payload for all stdio probes:

```
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

A probe passes if the response contains `"result"`. Wrap each probe in `timeout 15` to avoid hanging if a server stalls.

**imessages** (macOS only, if selected):
```bash
echo "$INIT" | timeout 15 node <toolkit_root>/productivity/mcp-servers/imessages/index.js 2>/dev/null | head -1
```

**gmessages** (if selected and binary is present):
```bash
# Windows:
echo "$INIT" | timeout 15 "<gmessages_binary_path>" 2>/dev/null | head -1
# macOS/Linux:
echo "$INIT" | timeout 15 <gmessages_binary_path> 2>/dev/null | head -1
```

**todoist** (HTTP, if token was provided):
```bash
curl -s --max-time 10 -X POST https://ai.todoist.net/mcp \
  -H "Content-Type: application/json" \
  -d "$INIT" 2>/dev/null | head -c 300
```
Pass if the response contains `"result"` or `"protocolVersion"`.

**windows-control** (Windows only, if registered):
```bash
echo "$INIT" | timeout 15 uvx windows-mcp 2>/dev/null | head -1
```

**macos-automator** (macOS only, if registered):
```bash
echo "$INIT" | timeout 15 npx -y @steipete/macos-automator-mcp@latest 2>/dev/null | head -1
```

**home-mcp** (macOS only, if registered):
```bash
echo "$INIT" | timeout 15 npx -y home-mcp@latest 2>/dev/null | head -1
```

**apple-events** (macOS only, if registered):
```bash
echo "$INIT" | timeout 15 npx -y @modelcontextprotocol/server-apple-events@latest 2>/dev/null | head -1
```

Only probe servers that were selected and registered. If a probe times out or returns no `"result"`, mark it WARN (not hard FAIL) — the server may work fine once Claude Code loads it, since some servers behave differently when launched by Claude vs. a raw pipe. Show the warning with a note: "This server may still work — try `/health` after restarting Claude."

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
  imessages responds to initialize ...... OK
  gmessages responds to initialize ...... OK
  Todoist responds to initialize ........ OK
  windows-control responds to initialize  OK  (Windows only)
  macos-automator responds to initialize  OK  (macOS only)
  home-mcp responds to initialize ....... OK  (macOS only)
  apple-events responds to initialize ... OK  (macOS only)
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
