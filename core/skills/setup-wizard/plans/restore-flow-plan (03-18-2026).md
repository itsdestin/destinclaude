# Setup Wizard Restore Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Phase 0 "prior use" gate to the setup wizard so returning users on a new device can restore from a GitHub or Google Drive backup instead of starting fresh.

**Architecture:** Insert Phase 0 before Phase 1 in `SKILL.md`. Phase 0 asks one question, branches to restore sub-flows (0A for GitHub, 0B for Drive, 0C for iCloud placeholder), then routes to an abbreviated dependency check (Phase 0C) that skips Phase 5. Update six supporting docs to reflect the new restore path.

**Tech Stack:** Markdown (SKILL.md is Claude skill prose), bash commands embedded in skill instructions, rclone, git.

---

## File Map

| File | Change |
|------|--------|
| `core/skills/setup-wizard/SKILL.md` | Insert Phase 0, 0A, 0B, 0C sections; update Phase 5 Step 3 to skip if restore was performed |
| `README.md` | Add "Returning user?" entry under Get Started |
| `docs/quickstart.md` | Add one-liner note that wizard handles restore |
| `docs/for-beginners/03-installing-the-toolkit.md` | Add step 0 to wizard walkthrough, update phase count and descriptions |
| `bootstrap/prerequisites.md` | Update "After the Script" section |
| `core/specs/backup-system-spec.md` | Add note that wizard handles interactive restore; bump version |
| `core/specs/personal-sync-spec.md` | Add note connecting session-start pull to restore flow |

---

## Task 1: Add Phase 0 (prior use question + routing) to SKILL.md

**Files:**
- Modify: `plugins/destinclaude/core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md**

Read the file and confirm the current first section heading is `## Phase 1: Environment Inventory`.

- [ ] **Step 2: Insert Phase 0 immediately before `## Phase 1`**

Insert the following block. Replace everything from the start of `## Phase 1` — do NOT modify Phase 1 itself, just insert before it.

```markdown
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

If the user answers **2 (no)** or indicates they're new, skip directly to **Phase 1**.

If the user answers **1 (yes)** or indicates prior use, continue to Step 2.

### Step 2: Ask which backup source

Say:

```
Where did you back up your data?

  1. GitHub (private config repo)
  2. Google Drive
  3. iCloud
  4. Not sure / skip
```

- **4 (not sure / skip):** Proceed to Phase 1 normally.
- **3 (iCloud):** Say "iCloud restore support is coming — for now, let's do a fresh install. I'll make sure everything is set up to back up to iCloud going forward." Then proceed to Phase 1 normally.
- **1 (GitHub):** Proceed to **Phase 0A: GitHub Restore**.
- **2 (Google Drive):** Proceed to **Phase 0B: Drive Restore**.

**Wait for the user's answer before proceeding.**

---
```

- [ ] **Step 3: Read back the inserted section**

Re-read the file. Confirm Phase 0 appears before Phase 1, the question text is verbatim as above, and routing is correct.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): add Phase 0 prior-use question and routing"
```

---

## Task 2: Add Phase 0A (GitHub restore sub-flow) to SKILL.md

**Files:**
- Modify: `plugins/destinclaude/core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Insert Phase 0A immediately after the Phase 0 block (before Phase 1)**

Add the following section after Phase 0's closing `---`:

```markdown
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
        sed -i "s|$OLD_HOME|$NORM_HOME|g" "$file"
    done
    echo "  Updated path references: $OLD_HOME → $NORM_HOME"
fi

if [[ -n "$OLD_SLUG" && "$OLD_SLUG" != "$CURRENT_SLUG" ]]; then
    find ~/.claude -type f \( -name "*.md" -o -name "*.sh" -o -name "*.json" \) \
        -not -path "*/.git/*" -not -path "*/node_modules/*" \
        -exec grep -l "$OLD_SLUG" {} \; | while read -r file; do
        sed -i "s|$OLD_SLUG|$CURRENT_SLUG|g" "$file"
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
```

- [ ] **Step 2: Read back Phase 0A**

Re-read the file. Confirm the bash commands are present verbatim, Phase 0A ends with a `---` separator, and Phase 0B hasn't started yet.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): add Phase 0A GitHub restore sub-flow"
```

---

## Task 3: Add Phase 0B (Drive restore sub-flow) to SKILL.md

**Files:**
- Modify: `plugins/destinclaude/core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Insert Phase 0B immediately after Phase 0A (before Phase 1)**

Add the following section after Phase 0A's closing `---`:

```markdown
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
```

- [ ] **Step 2: Read back Phase 0B**

Re-read the file. Confirm bash commands are present, `$DRIVE_ROOT` is used consistently, and "same steps as Phase 4" cross-references are accurate.

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): add Phase 0B Drive restore sub-flow"
```

---

## Task 4: Add Phase 0C (abbreviated dependency check) and update Phase 5 skip logic

**Files:**
- Modify: `plugins/destinclaude/core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Insert Phase 0C immediately after Phase 0B (before Phase 1)**

Add the following section after Phase 0B's closing `---`:

```markdown
## Phase 0C: Abbreviated Dependency Check

*Used only after Phase 0A or 0B. Skip this section for fresh installs — they use Phase 4.*

Tell the user: "Let me make sure all the tools your restored config needs are installed on this machine."

Read `~/.claude/toolkit-state/config.json` to determine which layers were previously installed (`installed_layers`). Run the dependency checks from **Phase 4** for each relevant layer:

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
```

- [ ] **Step 2: Update Phase 5, Step 3 to guard against overwriting restored encyclopedia files**

Find the Phase 5 Step 3 section in the file — it's headed `### Step 3: Install encyclopedia starter templates (if Life layer selected)`. The current instruction says "Only copy files that don't already exist — never overwrite existing encyclopedia content." This constraint already handles the restore case correctly. Add one sentence at the start of this step to make it explicit:

Change the opening of Step 3 from:

```
Copy the starter templates from `<toolkit_root>/life/templates/` to the user's local encyclopedia directory...
```

To:

```
**Skip this step entirely if a restore was performed in Phase 0** — encyclopedia files were pulled from backup and already exist. For fresh installs only: copy the starter templates from `<toolkit_root>/life/templates/` to the user's local encyclopedia directory...
```

- [ ] **Step 3: Read back Phase 0C and the Phase 5 change**

Confirm Phase 0C appears after Phase 0B and before Phase 1. Confirm Phase 5 Step 3 has the restore guard. Confirm Phase 0C correctly cross-references Phase 4 and jumps to Phase 6.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): add Phase 0C abbreviated check, guard Phase 5 templates on restore"
```

---

## Task 5: Update README.md

**Files:**
- Modify: `plugins/destinclaude/README.md`

- [ ] **Step 1: Find the "Get Started" section**

Read `README.md`. Locate the `## Get Started` section. It currently has two entries: "New to Claude Code?" and "Already Use Claude Code?".

- [ ] **Step 2: Add a third entry**

Add the following entry after "Already Use Claude Code?" and before "Want the Deep Dive?":

```markdown
### Returning User on a New Device?
The setup wizard will ask if you have a backup and walk you through restoring it. Just run the installer or `/setup-wizard` and answer the first question.
```

- [ ] **Step 3: Read back and verify**

Confirm the new entry is present, correctly placed, and doesn't disrupt surrounding formatting.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add README.md
git commit -m "docs: add returning-user entry to README Get Started section"
```

---

## Task 6: Update docs/quickstart.md

**Files:**
- Modify: `plugins/destinclaude/docs/quickstart.md`

- [ ] **Step 1: Find the Configure section**

Read `docs/quickstart.md`. Locate the `## Configure` section. It currently describes the wizard as handling "conflict resolution, layer selection, dependency installation, personalization, and verification."

- [ ] **Step 2: Add a restore note**

After the sentence ending "...and verification." add:

```markdown

> **Returning from another device?** When the wizard starts, answer "Yes" to the prior-use question and choose your backup source (GitHub or Google Drive). It will restore your config and skip straight to verification.
```

- [ ] **Step 3: Read back and verify**

Confirm the note is present and renders as a blockquote.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add docs/quickstart.md
git commit -m "docs: add restore note to quickstart"
```

---

## Task 7: Update docs/for-beginners/03-installing-the-toolkit.md

**Files:**
- Modify: `plugins/destinclaude/docs/for-beginners/03-installing-the-toolkit.md`

- [ ] **Step 1: Find the wizard walkthrough**

Read the file. Locate the `## Running the Setup Wizard` section. The numbered steps currently start at `### 1. Environment Check`.

- [ ] **Step 2: Add step 0 before the numbered steps**

Insert the following before `### 1. Environment Check`:

```markdown
### 0. Prior Use Check
Claude asks whether you've used DestinClaude before. If you're coming from another device with a backup on GitHub or Google Drive, say yes and choose your backup source — Claude will restore your data and skip the setup steps that aren't needed. If this is your first time, say no and continue normally.

```

- [ ] **Step 3: Update the step count in the intro paragraph**

The paragraph before the numbered steps says "Here's what to expect:" followed by the steps. No count is stated explicitly, so no text change is needed here. Just verify the flow reads naturally with the new step 0.

- [ ] **Step 4: Read back and verify**

Confirm step 0 appears before step 1, the language is non-technical and matches the beginner guide tone, and the rest of the numbered steps are unchanged.

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add docs/for-beginners/03-installing-the-toolkit.md
git commit -m "docs: add step 0 (prior use check) to beginner wizard walkthrough"
```

---

## Task 8: Update bootstrap/prerequisites.md

**Files:**
- Modify: `plugins/destinclaude/bootstrap/prerequisites.md`

- [ ] **Step 1: Find the "After the Script" section**

Read `bootstrap/prerequisites.md`. Locate `## After the Script`. It currently says: "The script ends by telling you to open Claude Code and say 'set me up.' From there, Claude walks you through choosing which toolkit features you want..."

- [ ] **Step 2: Update the paragraph**

Replace the current "After the Script" paragraph with:

```markdown
The script ends by launching Claude Code automatically and starting the setup wizard. The first thing Claude will ask is whether you've used DestinClaude before — if you're restoring from another device, say yes and choose your backup source. If this is your first time, say no and Claude will walk you through choosing which toolkit features you want, personalizing your setup, and making sure everything works. You're in control the whole time.
```

- [ ] **Step 3: Read back and verify**

Confirm the updated paragraph is present, accurately describes both paths (restore and fresh install), and matches the plain-language tone of the rest of the file.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add bootstrap/prerequisites.md
git commit -m "docs: update prerequisites 'After the Script' section for restore path"
```

---

## Task 9: Update core/specs/backup-system-spec.md

**Files:**
- Modify: `plugins/destinclaude/core/specs/backup-system-spec.md`

- [ ] **Step 1: Read the current spec**

Read the file. Note the current version (3.2) and the `## Current Implementation` section.

- [ ] **Step 2: Add a restore note to the Current Implementation section**

Find the `### Git Sync Flow` subsection (or add a new `### Interactive Restore` subsection before it). Add the following as a new subsection after the intro table of tracked projects:

```markdown
### Interactive Restore (Setup Wizard)

The setup wizard (`core/skills/setup-wizard/SKILL.md`) provides an interactive restore path for returning users on new devices. When the user identifies prior use, the wizard:

- **GitHub backend:** Clones or pulls the private config repo, rewrites hardcoded paths, and merges `mcp-servers/mcp-config.json` back into `~/.claude.json`
- **Drive backend:** Configures rclone, then pulls encyclopedia files, personal data, and transcripts using the same rclone paths as the session-start hook

After restore, the wizard runs an abbreviated dependency check and skips personalization (Phase 5). The session-start hook then handles all subsequent downsyncing automatically on every session start.

The manual `restore.sh` script (in the private config repo) remains available as a power-user alternative.
```

- [ ] **Step 3: Bump version and add changelog entry**

Update the frontmatter version from `3.2` to `3.3` and the `Last updated` date to `2026-03-18`.

Add to the Change Log table:

```markdown
| 2026-03-18 | 3.3 | Added Interactive Restore section: setup wizard now handles restore for returning users via GitHub or Drive, complementing the existing manual restore.sh path. | Update | — |
```

- [ ] **Step 4: Read back and verify**

Confirm the new subsection is present, version is bumped, and changelog entry is added.

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/backup-system-spec.md
git commit -m "docs(spec): add interactive restore section to backup-system-spec v3.3"
```

---

## Task 10: Update core/specs/personal-sync-spec.md

**Files:**
- Modify: `plugins/destinclaude/core/specs/personal-sync-spec.md`

- [ ] **Step 1: Read the current spec**

Read the file. Note the current version and the Design Decisions table. Find the `Session-start pull for cross-device sync` design decision row.

- [ ] **Step 2: Add a note to the session-start design decision**

In the Design Decisions table, find the row for `Session-start pull for cross-device sync`. Extend its Rationale cell to add:

```
For first-session restore (new device), the setup wizard (Phase 0B) performs the initial pull before the session-start hook is ever invoked — the hook then handles all subsequent syncs automatically.
```

- [ ] **Step 3: Read back and verify**

Confirm the rationale cell is updated and the table still renders correctly.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/personal-sync-spec.md
git commit -m "docs(spec): clarify session-start pull relationship to wizard restore in personal-sync-spec"
```

---

## Task 11: Sync to ~/.claude symlink targets

**Note:** The SKILL.md at `~/.claude/skills/setup-wizard/SKILL.md` is a symlink to `plugins/destinclaude/core/skills/setup-wizard/SKILL.md`. No action needed — edits to the plugin source are automatically reflected. Verify after Task 4:

- [ ] **Step 1: Verify symlink**

```bash
cat ~/.claude/skills/setup-wizard/SKILL.md | grep "Phase 0"
```

Expected: prints the Phase 0 heading. If it prints nothing, the symlink is broken — check with `ls -la ~/.claude/skills/setup-wizard` and re-create if needed.

- [ ] **Step 2: If symlink is broken, re-create it**

```bash
rm -rf ~/.claude/skills/setup-wizard
ln -sf ~/.claude/plugins/destinclaude/core/skills/setup-wizard ~/.claude/skills/setup-wizard
```

---

## Final Verification

- [ ] Read `core/skills/setup-wizard/SKILL.md` — confirm Phase 0, 0A, 0B, 0C all appear before Phase 1, and Phase 5 Step 3 has the restore guard
- [ ] Read `README.md` — confirm returning-user entry under Get Started
- [ ] Read `docs/quickstart.md` — confirm restore blockquote present
- [ ] Read `docs/for-beginners/03-installing-the-toolkit.md` — confirm step 0 present before step 1
- [ ] Read `bootstrap/prerequisites.md` — confirm "After the Script" updated
- [ ] Read `core/specs/backup-system-spec.md` — confirm version 3.3, new subsection, changelog entry
- [ ] Read `core/specs/personal-sync-spec.md` — confirm design decision note updated
- [ ] Run `git log --oneline -10` — confirm all 10 commits landed cleanly
