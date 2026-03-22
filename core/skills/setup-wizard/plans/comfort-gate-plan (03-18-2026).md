# Comfort Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented

**Goal:** Add a comfort-level question (Phase 0.5) to the setup wizard that adapts output style and wizard verbosity.

**Architecture:** Single file edit to `SKILL.md` — insert Phase 0.5 section, add comfort-level conditionals to Phases 1–6, update Phase 5f and Phase 6 to be comfort-aware.

**Spec:** `core/skills/setup-wizard/plans/comfort-gate-design (03-18-2026).md`

**Note:** All line numbers reference the pre-edit state of SKILL.md. After Task 1 inserts ~70 lines, all subsequent line numbers will have shifted. Use the contextual anchors (phase headers, exact string matches) as the primary locators.

---

### Task 1: Insert Phase 0.5 — The Comfort Gate

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Update Phase 0 routing to point to Phase 0.5**

Find this line (line 31):
```
If the user answers **2 (no)** or indicates they're new, skip directly to **Phase 1**.
```
Change to:
```
If the user answers **2 (no)** or indicates they're new, proceed to **Phase 0.5**.
```

- [ ] **Step 2: Insert Phase 0.5 section**

Insert the following new section between the `---` that ends Phase 0C (after line 249) and `## Phase 1: Environment Inventory` (line 251):

````markdown
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
````

- [ ] **Step 3: Verify the insertion reads correctly**

Read back lines around the insertion point to confirm Phase 0.5 sits cleanly between Phase 0C and Phase 1, with proper `---` separators.

- [ ] **Step 4: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat: add Phase 0.5 comfort gate to setup wizard"
```

---

### Task 2: Update Phase 0C for Missing Comfort Level

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (Phase 0C)

- [ ] **Step 1: Add fallback for missing comfort_level in restored configs**

In Phase 0C, after the instruction to read `config.json` to determine installed layers (find: `Read \`~/.claude/toolkit-state/config.json\` to determine which layers were previously installed`), add:

```markdown
If `config.json` exists but does not contain a `comfort_level` key (backups from before this feature), default to `"intermediate"` and store it in working state. Do not ask the user — this preserves the pre-comfort-gate behavior. The user can change it on a future re-run of `/setup-wizard`.
```

- [ ] **Step 2: Verify the insertion**

Read back Phase 0C to confirm it reads correctly.

- [ ] **Step 3: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat: handle missing comfort_level in restored configs"
```

---

### Task 3: Add Comfort-Level Conditionals to Phases 1–4

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (Phases 1, 2, 3, 4)

- [ ] **Step 1: Add comfort-level note to Phase 1 (Environment Inventory)**

After the Phase 1 header (`## Phase 1: Environment Inventory`) and its intro line ("Before installing anything, understand what's already on the user's system."), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** After presenting findings in Step 4, add plain-language explanations of what each item means (e.g., "Skills are like specialized instructions that teach Claude how to do specific things").
> - **Intermediate:** No change — present findings normally.
> - **Power user:** Run Steps 1–3 silently. Only present Step 4 findings if conflicts are detected. If no conflicts, say: "Clean slate — moving on." and proceed without waiting for acknowledgment.
```

- [ ] **Step 2: Add comfort-level note to Phase 2 (Conflict Resolution)**

After the Phase 2 header (`## Phase 2: Conflict Resolution`) and its conditional skip line ("If Phase 1 found no existing setup, skip to Phase 3."), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** For each conflict, explain what it means and why it matters in plain language. Recommend a safe default for each conflict and explain why it's safe.
> - **Intermediate:** No change.
> - **Power user:** If no conflicts exist, skip Phase 2 entirely without mentioning it. If conflicts exist, present them tersely in a table format and ask for resolution.
```

- [ ] **Step 3: Add comfort-level note to Phase 3 (Layer Selection)**

After the Phase 3 header (`## Phase 3: Layer Selection`) and its intro line ("Present the installable layers and let the user choose."), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** Keep the full layer explanations. After presenting, recommend: "If you're not sure, I'd suggest the full install — you can always remove things later."
> - **Intermediate:** No change.
> - **Power user:** Skip the layer explanation block. Instead say: "Installing all layers (Core, Life, Productivity). Good?" If the user confirms, proceed. If they want to customize, fall back to option 4 (individual selection) without the explanatory text.
```

- [ ] **Step 4: Add comfort-level note to Phase 4 (Dependency Installation)**

After the Phase 4 header (`## Phase 4: Dependency Installation`) and its intro text ("Install external tools required by the selected layers. For each dependency, follow this pattern:"), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** Before installing each tool, explain what it is and why the toolkit needs it (e.g., "Git is a tool that tracks changes to files — like an undo history for your whole computer").
> - **Intermediate:** No change.
> - **Power user:** Install all dependencies silently. After all installs complete, show a single summary table of what was installed and its status (OK / already installed / FAILED). Only pause for user input if something fails.
```

- [ ] **Step 5: Verify all four insertions**

Read back each phase header area to confirm the comfort-level notes are properly placed.

- [ ] **Step 6: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat: add comfort-level conditionals to Phases 1-4"
```

---

### Task 4: Add Comfort-Level Conditionals to Phase 5

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (Phase 5 personalization + Phase 5f plugins)

- [ ] **Step 1: Add comfort-level note to Phase 5 (Personalization)**

After the Phase 5 header (`## Phase 5: Personalization`) and its intro line ("Fill in template variables, install selected layers, and configure CLAUDE.md."), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** Keep all explanatory framing for template variable questions (the "by 'root' I just mean..." style). When asking about `GIT_REMOTE` and `PERSONAL_SYNC_BACKEND`, keep the full tutorial offers and plain-language explanations.
> - **Intermediate:** No change (this is the current behavior).
> - **Power user:** Strip all explanatory framing from template variable questions — ask them rapid-fire with just the variable name and default. Skip the GitHub/sync tutorial offers (just ask the raw question). Example: "Google Drive root folder? (default: Claude)" instead of the multi-line explanation.
```

- [ ] **Step 2: Update Phase 5f to be comfort-aware**

In Phase 5f, find this text:

```
**Important:** These plugins are downloaded automatically by Claude Code on first use — no manual install step needed. If a plugin is already present in `enabledPlugins`, skip it (don't overwrite the existing value).
```

Replace with:

```
**Important:** These plugins are downloaded automatically by Claude Code on first use — no manual install step needed. If a plugin is already present in `enabledPlugins` (key exists, regardless of whether value is `true` or `false`), skip it — don't overwrite the existing value. This is critical for the output style plugins, which were already set by Phase 0.5 based on the user's comfort level. (Phase 0.5 handles the re-run/re-choice case by overwriting before Phase 5f runs.)
```

- [ ] **Step 3: Verify changes**

Read back Phase 5 header area and Phase 5f to confirm edits.

- [ ] **Step 4: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat: add comfort-level conditionals to Phase 5 and 5f"
```

---

### Task 5: Update Phase 6 Verification

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (Phase 6)

- [ ] **Step 1: Add comfort-level note to Phase 6**

After the Phase 6 header (`## Phase 6: Verification`) and its intro line ("Run a health check on everything that was installed."), insert:

```markdown
> **Comfort-level adaptation:**
> - **Beginner:** Celebrate warmly. If any check fails, explain what it means and what went wrong in plain language before offering to fix it.
> - **Intermediate:** No change.
> - **Power user:** Show results as a compact pass/fail table with no narration. Only provide detail for items that fail.
```

- [ ] **Step 2: Update the plugin check in Phase 6 Step 1**

Find this line:

```
- [ ] All 14 marketplace plugins present in `~/.claude/settings.json` `enabledPlugins`
```

Replace with:

```
- [ ] All 14 marketplace plugin keys present in `~/.claude/settings.json` `enabledPlugins` (keys may be `true` or `false` — both count as present; beginners will have `learning-output-style` set to `false`)
```

- [ ] **Step 3: Verify changes**

Read back Phase 6 header area and the plugin check line.

- [ ] **Step 4: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat: make Phase 6 verification comfort-level-aware"
```

---

### Task 6: Final Review

- [ ] **Step 1: Read the full SKILL.md and verify end-to-end flow**

Verify:
- Phase 0 routes fresh installs to Phase 0.5 (not Phase 1)
- Phase 0.5 appears between Phase 0C and Phase 1
- Phase 0.5 writes output style to settings.json immediately
- Phase 0C handles missing comfort_level gracefully
- Phase 0A/0B restore paths still proceed directly to Phase 0C → Phase 6, never hitting Phase 0.5
- All six phases (1–6) have comfort-level adaptation callout boxes
- Phase 5f skips output style plugins that are already present (key exists, regardless of value)
- Phase 6 accepts both true and false plugin values

- [ ] **Step 2: Commit any final fixes**

```bash
git add core/skills/setup-wizard/SKILL.md
git commit -m "fix: final cleanup for comfort gate feature"
```

(Only if fixes were needed.)
