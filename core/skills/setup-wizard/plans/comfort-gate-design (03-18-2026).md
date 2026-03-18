# Comfort Gate Design

**Date:** 2026-03-18
**Feature:** Setup Wizard Comfort Level Gate (Phase 0.5)
**Status:** Approved

---

## Summary

Add a comfort-level question early in the setup wizard (between Phase 0 and Phase 1) that adapts the setup experience based on the user's familiarity with the terminal and Claude Code. The answer drives two things: output style plugin selection and how verbose/guided the remaining phases are.

---

## Phase 0.5: Comfort Level

### Placement

- Fires after Phase 0 (Prior Use Check), before Phase 1 (Environment Inventory)
- **Only for fresh installs** — restore paths (Phase 0A/0B → 0C → 6) skip this entirely

### The Question

Said exactly:

```
How comfortable are you with this terminal and Claude Code?

  1. I have no idea what I'm doing and I'm scared
     → Full guided setup with detailed explanations at every step

  2. I know what I'm doing, but walk me through linking my accounts
     → Full setup wizard, standard pacing

  3. I really don't need any setup help
     → Speed run — defaults where possible, only asks what it has to
```

Natural language responses are accepted (same treatment as Phase 0).

### Immediate Actions

After the user answers:

1. Store `comfort_level` in working state: `"beginner"` / `"intermediate"` / `"power_user"`
2. Write output style plugin to `~/.claude/settings.json` immediately:
   - **Beginner:** enable `explanatory-output-style`, disable `learning-output-style`
   - **Intermediate:** enable both (current default)
   - **Power user:** enable both (current default)
3. Persist `comfort_level` to `~/.claude/toolkit-state/config.json`

The output style activates immediately, so the rest of setup benefits from it.

---

## Phase Adaptation Table

| Phase | Beginner | Intermediate | Power User |
|---|---|---|---|
| **Phase 1: Environment Inventory** | Full presentation with plain-language explanations of what each item means | Present findings normally (no change) | Run silently. Only surface results if conflicts are found. |
| **Phase 2: Conflict Resolution** | Extra context explaining what conflicts mean and why they matter. Recommend a safe default for each. | No change | Terse presentation. Still requires user input if conflicts exist. Skip entirely if none. |
| **Phase 3: Layer Selection** | Explain what each layer does in plain language. Recommend the "recommended" set. | No change | Default to all layers, confirm with one line: "Installing all layers (Core, Life, Productivity). Good?" |
| **Phase 4: Dependencies** | Explain what each tool is and why it's needed before installing. | No change | Batch install silently. Report results as a summary list, not one-by-one narration. |
| **Phase 5: Personalization** | Extra framing on each question (keep the "by 'root' I just mean..." style explanations) | No change (current behavior) | Strip all explanatory framing. Ask variables rapid-fire. Skip the GitHub/sync tutorial offers. |
| **Phase 5f: Plugins** | Output style already set in Phase 0.5 — skip those two entries. Register rest normally. | Same — skip the two output style entries, register rest. | Same. |
| **Phase 6: Verification** | Celebrate results warmly. Explain what each check means if it fails. | No change | Compact pass/fail table. No narration unless something fails. |

**Key principle:** Intermediate is the current behavior with zero changes. Beginner adds warmth and explanation. Power user strips narration and defaults aggressively.

---

## Config Schema

### Persisted in `~/.claude/toolkit-state/config.json`

```json
{
  "platform": "windows",
  "toolkit_root": "...",
  "comfort_level": "beginner",
  "installed_layers": ["core", "life", "productivity"],
  ...
}
```

Valid values: `"beginner"` | `"intermediate"` | `"power_user"`

### Re-run Behavior

If the wizard is re-run and `config.json` already has a `comfort_level`, pre-select it but still ask. Frame as: "Last time you chose [X]. Still feel the same, or want to change?"

### Phase 5f Interaction

Phase 5f checks whether output style plugins are already in `enabledPlugins`. Since Phase 0.5 already set them, it skips those entries. No new logic needed — this is already how 5f works ("if already present, skip it").

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| **Restore path (Phase 0A/0B)** | Phase 0.5 skipped entirely. `comfort_level` and output style preserved from backup. |
| **Restore but `comfort_level` missing** | Old backups won't have the field. Default to `"intermediate"` (preserves current behavior). User can change on re-run. |
| **`settings.json` doesn't exist yet** | Create it with just the `enabledPlugins` entry. Later phases merge into it. |
| **`settings.json` exists, no `enabledPlugins`** | Add the key with the output style entry. Later phases merge the rest. |
| **`settings.json` already has output style plugins (re-run)** | Overwrite based on new comfort choice. This is the one case where Phase 0.5 overwrites rather than skips — the user is explicitly re-choosing. |
| **Natural language answer** | "I'm terrified" → option 1, "just set it up" → option 3, etc. Same treatment as Phase 0. |
