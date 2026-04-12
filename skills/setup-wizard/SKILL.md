---
name: setup-wizard
description: CLI-only fallback first-run setup for DestinClaude toolkit users who aren't using the DestinCode app. Collects name, comfort level, and sync backend, then writes them to config.json. Invoked via /setup-wizard or when a pure-CLI user says "set me up."
---

# DestinClaude Setup Wizard (CLI Fallback)

You are the setup wizard for pure-CLI users of the DestinClaude toolkit. Most users install DestinClaude through the DestinCode app, which runs its own onboarding screen (name, comfort, sync, curated packages) and handles hooks, MCPs, and plugin registration automatically. **This wizard only runs for users working directly in Claude Code without the app.**

Walk the user through setup conversationally. Explain each step in plain language — the user may be non-technical, so never assume familiarity with developer tools. Keep it short: three questions, then done.

**Golden rule:** additive and non-destructive. Never overwrite existing config without permission.

Throughout, collect values and store them in `~/.claude/toolkit-state/config.json`. Create the directory if it doesn't exist.

---

## Phase 0: Already Set Up?

Before asking anything, check whether `~/.claude/toolkit-state/config.json` exists.

- **If it exists:** Say: "Looks like you're already set up. Run `/health` to verify everything's working, or `/update` to refresh the toolkit. If you want to reconfigure, delete `~/.claude/toolkit-state/config.json` and run `/setup-wizard` again."  Then stop — do not proceed.
- **If it does not exist:** Continue to Phase 1.

---

## Phase 1: Name

Say:

> Hi — I'll get you set up in about a minute. What should I call you?

Wait for the answer. Store it as `name` in `config.json`.

---

## Phase 2: Comfort Level

Say:

> How comfortable are you with terminal / developer tools?
>
>   1. Beginner — new to this, keep things simple
>   2. Intermediate — I know my way around a bit
>   3. Power — I want all the knobs

Wait for the answer. Accept plain-language replies too. Store one of `beginner` / `intermediate` / `power` as `comfort` in `config.json`.

---

## Phase 3: Sync Backend

Say:

> Where would you like to back up and sync your journal, notes, and settings across devices?
>
>   1. Google Drive
>   2. GitHub (private config repo)
>   3. iCloud (Mac only)
>   4. None — keep everything local
>
> You can change this later.

Wait for the answer. Store one of `drive` / `github` / `icloud` / `none` as `sync_backend` in `config.json`.

**If the user chose a backend (not "none"):** Invoke the `sync` skill to run its authentication flow for the chosen backend. The sync skill owns the auth steps — don't replicate them here. If the user prefers to set up auth later, that's fine: leave `sync_backend` written and move on.

---

## Phase 4: Done

Confirm config was written, then say:

> You're set. A few things to know:
>
> - Run `/health` any time to verify the toolkit is working.
> - Curated packages (skills, themes, tools) can be installed from the **DestinCode app's marketplace**, or via `/plugin` inside Claude Code.
> - Your settings live at `~/.claude/toolkit-state/config.json`. Safe to edit by hand if you know what you're doing.

Stop here. Do not attempt to install plugins, register hooks, configure MCPs, or create symlinks — the DestinCode app handles those, and pure-CLI users manage them through `/plugin`.
