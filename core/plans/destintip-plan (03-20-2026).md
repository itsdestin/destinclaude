# DestinTip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adaptive toolkit hint system that selects relevant tips per session and injects them into Claude's system prompt via the existing SessionStart hook.

**Architecture:** A JSON tip catalog (`core/data/destintip-catalog.json`) holds all tips with metadata. At session start, inline Node.js in `session-start.sh` reads the catalog + user state, filters/scores tips, selects top 4, and outputs `additionalContext` via the proven `hookSpecificOutput` JSON format. A state file (`~/.claude/toolkit-state/destintip-state.json`) tracks shown tips and discovered features across sessions.

**Tech Stack:** Bash (hook shell), Node.js (inline JSON processing), JSON (catalog + state)

**Spec:** `core/specs/destintip-spec.md` v1.1

---

### Task 1: Create the tip catalog

**Files:**
- Create: `core/data/destintip-catalog.json`

- [ ] **Step 1: Create the data directory**

```bash
mkdir -p ~/.claude/plugins/destinclaude/core/data
```

- [ ] **Step 2: Write the tip catalog**

Create `core/data/destintip-catalog.json` with tips covering all shipped features. Tips are ordered by priority (catalog order = tie-breaking order).

Features to cover (10 skills + 6 commands + general toolkit):
- **core:** setup-wizard, /toolkit, /health, /update, /contribute
- **life:** journaling-assistant, encyclopedia-compile, encyclopedia-interviewer, encyclopedia-librarian, encyclopedia-update, fork-file, google-drive
- **productivity:** inbox-processor, skill-creator
- **general:** memory system, personal sync, toolkit overview

Each tip needs: `id`, `feature`, `category`, `comfort_levels`, `requires_discovered`, `text`, `context_hint`.

Guidelines for writing tips:
- Beginner tips: explain what a feature does and how to invoke it
- Intermediate tips: highlight deeper capabilities, connections between features
- Power-user tips: advanced workflows, feature combinations, customization
- `requires_discovered` should create a natural learning path (e.g., encyclopedia-compile requires journaling-assistant)
- `context_hint` should be specific and actionable for Claude (e.g., "when the user mentions food, groceries, or cooking")

```json
{
  "tips": [
    {
      "id": "journal-basics",
      "feature": "journaling-assistant",
      "category": "life",
      "comfort_levels": ["beginner", "intermediate", "power_user"],
      "requires_discovered": [],
      "text": "You have a built-in journaling system. Say \"let's journal\" or use /journaling-assistant to start a conversational daily entry that gets saved as a dated Markdown file.",
      "context_hint": "Suggest when the user is reflecting on their day, venting, describing events, or seems to want to record something."
    },
    {
      "id": "toolkit-overview",
      "feature": "toolkit",
      "category": "core",
      "comfort_levels": ["beginner"],
      "requires_discovered": [],
      "text": "Type /toolkit to see all your installed features and useful phrases at a glance.",
      "context_hint": "Suggest when the user seems unsure what the toolkit can do or asks about available features."
    },
    {
      "id": "google-drive-basics",
      "feature": "google-drive",
      "category": "life",
      "comfort_levels": ["beginner", "intermediate", "power_user"],
      "requires_discovered": [],
      "text": "Your toolkit can read and write files on Google Drive. Say \"upload this to Drive\" or use /google-drive for file operations.",
      "context_hint": "Suggest when the user mentions files, documents, backups, or cloud storage."
    },
    {
      "id": "health-check",
      "feature": "health",
      "category": "core",
      "comfort_levels": ["beginner", "intermediate"],
      "requires_discovered": [],
      "text": "If something feels off, type /health to run a quick diagnostic that checks all your toolkit components.",
      "context_hint": "Suggest when the user encounters errors, missing features, or something not working as expected."
    },
    {
      "id": "inbox-basics",
      "feature": "inbox-processor",
      "category": "productivity",
      "comfort_levels": ["beginner", "intermediate", "power_user"],
      "requires_discovered": [],
      "text": "You can capture quick notes from your phone to a Todoist inbox. Claude will process them at the start of each session — answering questions, creating tasks, or filing information.",
      "context_hint": "Suggest when the user mentions notes, quick capture, phone notes, or wants to remember something for later."
    },
    {
      "id": "fork-file-basics",
      "feature": "fork-file",
      "category": "life",
      "comfort_levels": ["beginner", "intermediate", "power_user"],
      "requires_discovered": [],
      "text": "Fork File tracks your groceries, pantry inventory, and fast food spending. Say \"I bought groceries\" or \"log my fast food\" to get started.",
      "context_hint": "Suggest when the user mentions food, groceries, cooking, pantry, fridge, restaurants, or food spending."
    },
    {
      "id": "update-toolkit",
      "feature": "update",
      "category": "core",
      "comfort_levels": ["beginner", "intermediate"],
      "requires_discovered": [],
      "text": "Type /update to check for and install the latest toolkit version. New features and fixes are released regularly.",
      "context_hint": "Suggest when the user asks about new features, or if the statusline shows an update is available."
    },
    {
      "id": "encyclopedia-intro",
      "feature": "encyclopedia-update",
      "category": "life",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": ["journaling-assistant"],
      "text": "Your journal entries feed into the Encyclopedia system — a set of modular files that build up a comprehensive record of your life, beliefs, goals, and relationships over time.",
      "context_hint": "Suggest when the user has been journaling and mentions wanting to organize or look back at their life information."
    },
    {
      "id": "encyclopedia-compile",
      "feature": "encyclopedia-compile",
      "category": "life",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": ["encyclopedia-update"],
      "text": "Use /encyclopedia-compile to generate a full biography document from your Encyclopedia source files. It weaves everything into a single readable narrative.",
      "context_hint": "Suggest when the user wants a comprehensive view of their life record or mentions compiling their information."
    },
    {
      "id": "encyclopedia-search",
      "feature": "encyclopedia-librarian",
      "category": "life",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": ["encyclopedia-update"],
      "text": "Need to look something up from your journal or Encyclopedia? The Librarian can search your entire life record — say \"search my encyclopedia for...\" or \"brief me on [person].\"",
      "context_hint": "Suggest when the user is trying to recall information about people, events, or past decisions they may have recorded."
    },
    {
      "id": "encyclopedia-interview",
      "feature": "encyclopedia-interviewer",
      "category": "life",
      "comfort_levels": ["power_user"],
      "requires_discovered": ["encyclopedia-update"],
      "text": "The Encyclopedia Interviewer proactively identifies gaps in your life record and runs focused interview sessions to fill them. Say \"interview me\" to start.",
      "context_hint": "Suggest when the user has a mature Encyclopedia and mentions wanting to flesh out their record or fill gaps."
    },
    {
      "id": "skill-creator-basics",
      "feature": "skill-creator",
      "category": "productivity",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": [],
      "text": "Want to teach Claude a new trick? The Skill Creator helps you build custom skills — reusable capabilities that Claude can invoke. Say \"create a skill\" to get started.",
      "context_hint": "Suggest when the user has a repetitive workflow they want to automate or mentions wanting Claude to do something it doesn't currently do."
    },
    {
      "id": "personal-sync",
      "feature": "personal-sync",
      "category": "core",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": [],
      "text": "Your toolkit can sync memory, config, and CLAUDE.md across devices via Google Drive or GitHub. Check /health to see your sync status.",
      "context_hint": "Suggest when the user mentions multiple devices, syncing, or backing up their Claude configuration."
    },
    {
      "id": "journal-to-encyclopedia",
      "feature": "encyclopedia-update",
      "category": "life",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": ["journaling-assistant"],
      "text": "At the end of each journaling session, your entries are automatically routed to the right Encyclopedia source files — people go to People Database, events to Chronicle, goals to Open Threads.",
      "context_hint": "Suggest after a journaling session or when the user asks how journal entries are organized long-term."
    },
    {
      "id": "contribute-upstream",
      "feature": "contribute",
      "category": "core",
      "comfort_levels": ["power_user"],
      "requires_discovered": ["skill-creator"],
      "text": "Built something cool with the toolkit? Type /contribute to package your improvements and share them back with other DestinClaude users.",
      "context_hint": "Suggest when the user has created custom skills or made modifications they're proud of."
    },
    {
      "id": "memory-system",
      "feature": "memory",
      "category": "core",
      "comfort_levels": ["beginner", "intermediate"],
      "requires_discovered": [],
      "text": "Claude remembers things across conversations using a file-based memory system. Say \"remember that I prefer...\" to save preferences, or \"what do you remember about...\" to recall.",
      "context_hint": "Suggest when the user corrects Claude's behavior, states a preference, or asks if Claude remembers something."
    },
    {
      "id": "setup-wizard-rerun",
      "feature": "setup-wizard",
      "category": "core",
      "comfort_levels": ["intermediate", "power_user"],
      "requires_discovered": [],
      "text": "You can re-run /setup-wizard at any time to change your comfort level, reconfigure integrations, or set up features you skipped the first time.",
      "context_hint": "Suggest when the user wants to change settings, add an integration they skipped, or adjust their comfort level."
    }
  ]
}
```

- [ ] **Step 3: Validate the catalog JSON schema**

Run a validation script that checks JSON well-formedness, required fields, valid comfort level values, and unique IDs:

```bash
node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const validLevels = new Set(["beginner", "intermediate", "power_user"]);
const required = ["id", "feature", "category", "comfort_levels", "requires_discovered", "text", "context_hint"];
const ids = new Set();
let errors = 0;
for (const t of c.tips) {
    for (const f of required) { if (!(f in t)) { console.error("Missing field " + f + " in tip " + t.id); errors++; } }
    for (const l of (t.comfort_levels || [])) { if (!validLevels.has(l)) { console.error("Invalid comfort level " + l + " in tip " + t.id); errors++; } }
    if (ids.has(t.id)) { console.error("Duplicate ID: " + t.id); errors++; }
    ids.add(t.id);
}
if (errors) { console.error(errors + " errors found"); process.exit(1); }
console.log(c.tips.length + " tips validated, all OK");
' ~/.claude/plugins/destinclaude/core/data/destintip-catalog.json
```

Expected: `17 tips validated, all OK`

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/data/destintip-catalog.json
git commit -m "feat(destintip): add tip catalog with 17 tips across all layers"
```

---

### Task 2: Add selection logic to session-start.sh

**Files:**
- Modify: `core/hooks/session-start.sh:336-359` (replace `/toolkit` reminder section)

- [ ] **Step 1: Remove the `/toolkit` reminder section (lines 336-359)**

Replace lines 336-359 (the entire `# --- Periodic /toolkit reminder ---` block) with the new DestinTip section. Keep the empty line (360) and `exit 0` (line 361) intact — the new code goes between the `# --- Check inbox ---` section and `exit 0`.

**Important:** Per the spec, the DestinTip section goes after the version check and announcement fetch, before the inbox check. However, since the DestinTip output is a JSON blob on stdout and doesn't depend on ordering relative to the inbox check, placing it where the old `/toolkit` reminder was (after inbox check, before `exit 0`) is functionally equivalent and minimizes diff churn.

The old code to remove (lines 336-359):
```bash
# --- Periodic /toolkit reminder ---
# Remind user about /toolkit every ~20 sessions so they discover features they may have forgotten
STATE_DIR="$CLAUDE_DIR/toolkit-state"
...
fi
```

- [ ] **Step 2: Write the DestinTip selection section**

Replace with this code. Key design points:
- Uses `TOOLKIT_ROOT` (already resolved at top of script) to find the catalog
- All logic in a single `node -e` inline script for atomicity
- Outputs to stdout (not stderr) using the `hookSpecificOutput` JSON format
- Gracefully skips if node unavailable, catalog missing, or 0 tips selected
- State file auto-created with defaults on first run

```bash
# --- DestinTip selection ---
# Adaptive toolkit hints: select tips based on comfort level, usage history, and rotation
if command -v node &>/dev/null; then
    _DESTINTIP_CATALOG=""
    [[ -n "$TOOLKIT_ROOT" ]] && _DESTINTIP_CATALOG="$TOOLKIT_ROOT/core/data/destintip-catalog.json"
    if [[ -z "$_DESTINTIP_CATALOG" || ! -f "$_DESTINTIP_CATALOG" ]]; then
        # Fallback: check relative to this script
        _DESTINTIP_CATALOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/destintip-catalog.json"
    fi
    if [[ -f "$_DESTINTIP_CATALOG" ]]; then
        node -e '
const fs = require("fs");
const configPath = process.argv[1];
const catalogPath = process.argv[2];
const statePath = process.argv[3];

// Read config
let comfortLevel = "intermediate";
try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.comfort_level) comfortLevel = config.comfort_level;
} catch {}

// Read catalog
let tips;
try {
    tips = JSON.parse(fs.readFileSync(catalogPath, "utf8")).tips;
} catch { process.exit(0); }
if (!tips || tips.length === 0) process.exit(0);

// Read or create state
let state = { session_count: 0, discovered_features: [], shown_tips: {} };
try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {}
state.session_count = (state.session_count || 0) + 1;
if (!state.discovered_features) state.discovered_features = [];
if (!state.shown_tips) state.shown_tips = {};
const sc = state.session_count;
const disc = new Set(state.discovered_features);

// Filter
const filtered = tips.filter(t => {
    if (!t.comfort_levels.includes(comfortLevel)) return false;
    if (t.requires_discovered.some(r => !disc.has(r))) return false;
    const shown = state.shown_tips[t.id];
    if (shown && (sc - shown.last_shown_session) <= 5) return false;
    return true;
});

if (filtered.length === 0) {
    // Still write state (session_count increment) even with no tips
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
    process.exit(0);
}

// Score (stable: array order preserved for ties)
const scored = filtered.map(t => {
    let score = 0;
    if (!disc.has(t.feature)) score += 10;
    const shown = state.shown_tips[t.id];
    if (!shown) score += 5;
    score += shown ? (sc - shown.last_shown_session) : sc;
    return { tip: t, score };
});
scored.sort((a, b) => b.score - a.score);

// Select top 4
const selected = scored.slice(0, 4).map(s => s.tip);

// Update state
for (const t of selected) {
    if (!state.shown_tips[t.id]) state.shown_tips[t.id] = { times_shown: 0, last_shown_session: 0 };
    state.shown_tips[t.id].times_shown++;
    state.shown_tips[t.id].last_shown_session = sc;
}
// Mark features as discovered if shown 3+ times
for (const [id, info] of Object.entries(state.shown_tips)) {
    if (info.times_shown >= 3) {
        const tip = tips.find(t => t.id === id);
        if (tip && !disc.has(tip.feature)) {
            state.discovered_features.push(tip.feature);
            disc.add(tip.feature);
        }
    }
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

// Build prompt
// NOTE: The '\''  sequences below are bash single-quote escapes (end quote, literal quote,
// resume quote). They MUST be preserved exactly — the entire node -e block is single-quoted in bash.
let prompt = "You have the DestinTip system active. Throughout this session, naturally weave toolkit hints into your responses when relevant. Use this exact format (with backticks and yellow ANSI color \\033[33m):\n\n";
prompt += "\"`\\033[33m★ DestinTip ────────────────────────────────────\\033[0m`\n[tip content here]\n`\\033[33m──────────────────────────────────────────────────\\033[0m`\"\n\n";
prompt += "Rules:\n";
prompt += "- Maximum 1 tip per response — do not overwhelm the user\n";
prompt += "- Only surface a tip when it is genuinely relevant to what the user is doing\n";
prompt += "- If nothing is relevant, do not force a tip — silence is fine\n";
prompt += "- Keep tips conversational and brief (1-2 sentences)\n";
prompt += "- Frame tips as helpful discovery, never prescriptive\n\n";
prompt += "The user'\''s comfort level is: " + comfortLevel + "\n";
prompt += "- beginner: Focus on basic features, explain what things do\n";
prompt += "- intermediate: Assume familiarity with basics, highlight deeper features\n";
prompt += "- power_user: Power-user tips, feature combinations, advanced workflows\n\n";
prompt += "Tips available this session:\n\n";
selected.forEach((t, i) => {
    prompt += (i + 1) + ". " + t.text + "\n";
    prompt += "   When to suggest: " + t.context_hint + "\n\n";
});

// Output
const output = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: prompt } };
console.log(JSON.stringify(output));
        ' "$CONFIG_FILE" "$_DESTINTIP_CATALOG" "$CLAUDE_DIR/toolkit-state/destintip-state.json" 2>/dev/null || true
    else
        echo '{"hookSpecificOutput": "Warning: DestinTip catalog not found."}' >&2
    fi
fi
```

- [ ] **Step 3: Verify session-start.sh is syntactically valid**

```bash
bash -n ~/.claude/plugins/destinclaude/core/hooks/session-start.sh && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 4: Test the selection logic in isolation**

Create a temporary test to verify tip selection works:

```bash
# Create a temp state file and run the node script portion
_TEST_STATE=$(mktemp)
echo '{"session_count":0,"discovered_features":[],"shown_tips":{}}' > "$_TEST_STATE"
node -e '
const fs = require("fs");
const config = { comfort_level: "beginner" };
const catalog = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const state = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
state.session_count++;
const filtered = catalog.tips.filter(t => t.comfort_levels.includes(config.comfort_level));
console.log("Beginner-eligible tips:", filtered.length);
console.log("First 4:", filtered.slice(0, 4).map(t => t.id).join(", "));
' ~/.claude/plugins/destinclaude/core/data/destintip-catalog.json "$_TEST_STATE"
rm "$_TEST_STATE"
```

Expected: Shows beginner-eligible tip count and first 4 IDs.

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(destintip): add tip selection logic to session-start hook

Replaces the periodic /toolkit reminder with adaptive DestinTip system.
Reads catalog + user state, filters by comfort level and discovery,
scores and selects top 4 tips, outputs additionalContext via stdout."
```

---

### Task 3: Clean up subsumed state file

**Files:**
- Remove reference: `~/.claude/toolkit-state/toolkit-reminder.json` (runtime cleanup)

- [ ] **Step 1: Add cleanup to session-start.sh**

Add a one-line cleanup to remove the old state file. Insert this line immediately before the `# --- DestinTip selection ---` comment added in Task 2 (with a blank line separating them):

```bash
# Clean up subsumed toolkit-reminder state
rm -f "$CLAUDE_DIR/toolkit-state/toolkit-reminder.json" 2>/dev/null

# --- DestinTip selection ---
```

The `rm -f` line is new; the `# --- DestinTip selection ---` line already exists from Task 2 and is shown here only as an anchor.

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "chore(destintip): clean up subsumed toolkit-reminder.json"
```

---

### Task 4: End-to-end verification

- [ ] **Step 1: Test the DestinTip Node.js logic in isolation**

The full `session-start.sh` uses `set -euo pipefail` and depends on git remotes, rclone, etc. — running it standalone will likely exit early. Instead, test the DestinTip selection logic directly by extracting and running just the Node.js portion:

```bash
# Reset state for clean test
rm -f ~/.claude/toolkit-state/destintip-state.json
# Run the node selection logic directly (same args as session-start.sh passes)
node -e '
const fs = require("fs");
const configPath = process.argv[1];
const catalogPath = process.argv[2];
const statePath = process.argv[3];
let comfortLevel = "intermediate";
try { const c = JSON.parse(fs.readFileSync(configPath, "utf8")); if (c.comfort_level) comfortLevel = c.comfort_level; } catch {}
let tips;
try { tips = JSON.parse(fs.readFileSync(catalogPath, "utf8")).tips; } catch { process.exit(1); }
let state = { session_count: 0, discovered_features: [], shown_tips: {} };
try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
state.session_count = (state.session_count || 0) + 1;
if (!state.discovered_features) state.discovered_features = [];
if (!state.shown_tips) state.shown_tips = {};
const sc = state.session_count;
const disc = new Set(state.discovered_features);
const filtered = tips.filter(t => {
    if (!t.comfort_levels.includes(comfortLevel)) return false;
    if (t.requires_discovered.some(r => !disc.has(r))) return false;
    const shown = state.shown_tips[t.id];
    if (shown && (sc - shown.last_shown_session) <= 5) return false;
    return true;
});
const scored = filtered.map(t => {
    let score = 0;
    if (!disc.has(t.feature)) score += 10;
    const shown = state.shown_tips[t.id];
    if (!shown) score += 5;
    score += shown ? (sc - shown.last_shown_session) : sc;
    return { tip: t, score };
});
scored.sort((a, b) => b.score - a.score);
const selected = scored.slice(0, 4).map(s => s.tip);
for (const t of selected) {
    if (!state.shown_tips[t.id]) state.shown_tips[t.id] = { times_shown: 0, last_shown_session: 0 };
    state.shown_tips[t.id].times_shown++;
    state.shown_tips[t.id].last_shown_session = sc;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("Comfort level:", comfortLevel);
console.log("Eligible tips:", filtered.length);
console.log("Selected:", selected.map(t => t.id).join(", "));
' ~/.claude/toolkit-state/config.json ~/.claude/plugins/destinclaude/core/data/destintip-catalog.json ~/.claude/toolkit-state/destintip-state.json
```

Expected: Shows comfort level (from config), eligible tip count, and 4 selected tip IDs.

- [ ] **Step 2: Verify state file was created**

```bash
cat ~/.claude/toolkit-state/destintip-state.json
```

Expected: JSON with `session_count: 1`, `discovered_features: []`, and `shown_tips` with entries for 4 tip IDs.

- [ ] **Step 3: Verify toolkit-reminder.json was cleaned up**

```bash
ls ~/.claude/toolkit-state/toolkit-reminder.json 2>&1
```

Expected: "No such file or directory"

- [ ] **Step 4: Run the isolated test a second time and verify rotation**

Run the same node command from Step 1 again (without resetting state). Check that `session_count` incremented and different tips may appear due to the cooldown filter.

```bash
node -e "const s=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('Session:', s.session_count, '| Tips shown:', Object.keys(s.shown_tips).length)" ~/.claude/toolkit-state/destintip-state.json
```

Expected: `Session: 2 | Tips shown: 4` (or more if different tips were selected on the second run).

- [ ] **Step 5: Verify session_count incremented**

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).session_count)" ~/.claude/toolkit-state/destintip-state.json
```

Expected: `2`

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
cd ~/.claude/plugins/destinclaude
git add core/data/ core/hooks/session-start.sh
git status
# Only commit if there are staged changes
git diff --cached --quiet || git commit -m "fix(destintip): adjustments from end-to-end testing"
```
