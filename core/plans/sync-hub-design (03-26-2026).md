---
title: "/sync Skill Enhancement — Unified Interactive Hub"
version: 1.1
status: approved
date: 2026-03-26
updated: 2026-03-31
affects:
  - skills/sync/SKILL.md
  - core/hooks/session-start.sh
  - core/hooks/personal-sync.sh
  - core/hooks/contribution-detector.sh
  - skill-creator skill (external, at ~/.claude/skills/skill-creator/)
  - ~/.claude/toolkit-state/skill-routes.json (new)
changelog:
  - version: 1.1
    date: 2026-03-31
    summary: "Reconcile with Infrastructure Safety sprint (PR #99) — account for hook-preamble, mutex, _capture_err, stash-before-pull, --skip-links, and config parsing changes"
---

# /sync Skill Enhancement — Unified Interactive Hub

## Goal

Evolve `/sync` from a status-and-warnings tool into a full sync management hub
with backend reconfiguration, per-skill backup routing, and round-trip backend
testing — all through a single conversational entry point.

## Core UX

`/sync` always shows the status dashboard first, then presents a contextual
action menu. No subcommands to memorize. The skill asks what you want to do and
routes accordingly.

### Flow

1. Always show the status dashboard (existing §1–§2)
2. Below the dashboard, present an action menu based on context:
   - If warnings exist → "Resolve warnings" (existing §3)
   - If unrouted skills detected → "Configure skill backups"
   - If unsynced projects detected → "Register projects" (existing §4)
   - Always available → "Reconfigure backends", "Manage skill backups", "Force sync now"
3. Ask "What would you like to do?" — user picks, skill routes to the right section
4. After completing an action, return to the dashboard (refreshed) and ask again,
   until user is done

The dashboard becomes a hub, not a one-shot report.

---

## Post-Draft Infrastructure Changes (PR #99, 2026-03-27 – 2026-03-31)

Since this plan was approved, the Infrastructure Safety sprint landed significant
hardening across all three target hooks. None of the plan's features were
implemented, but the hooks now have new patterns that implementations must use.

### New shared infrastructure: `hook-preamble.sh`

All three hooks now source `lib/hook-preamble.sh` as their first action. This
provides:
- **`register_cleanup "cmd"`** — registers shell commands to run on EXIT/SIGTERM/SIGINT
- **`_capture_err "label" cmd args...`** — replaces `2>/dev/null || true` with
  logged error capture; logs to `backup.log` on failure

**Implementation impact:** Any new code in these hooks must use `_capture_err`
instead of `2>/dev/null` for error-prone operations (e.g., reading/writing
`skill-routes.json`). Temp files must use `register_cleanup` instead of manual
`rm` in traps.

### `personal-sync.sh` — new mutex and config parsing

- **Mutex lock** (`~/.claude/toolkit-state/.personal-sync-lock/`) prevents
  concurrent sync instances. Uses `mkdir` atomic lock with PID tracking and
  `register_cleanup` for release.
- **`TOOLKIT_ROOT`** is now read from config via `config_get` early in the
  script, so `is_toolkit_owned()` works correctly for skill filtering.
- **Config parsing** was split from a single `read -r` with multivalue node
  output into three separate `node -e` calls (one per variable: `BACKEND`,
  `DRIVE_ROOT`, `SYNC_REPO`). This fixes a bug with spaces in `DRIVE_ROOT`.
- **`--skip-links`** added to rclone memory sync to prevent following aggregation
  symlinks.
- **`_capture_err`** wraps rclone calls instead of `2>/dev/null || { ... }`.

**Implementation impact:** The §8 `skill-routes.json` check in personal-sync
should be placed **after** the mutex acquisition (line ~88) but **before** the
debounce check, so that the route lookup happens once per sync cycle. The
skill-loop at lines 164–175 already filters by `is_toolkit_owned`; the
`skill-routes.json` lookup should be an additional filter inside that same loop.

### `session-start.sh` — stash-before-pull and git index repair

- **Stash-before-pull** in `_bg_git_pull()`: dirty working tree is stashed
  before `git pull --rebase` and popped after.
- **Git index auto-repair**: when symlink repair replaces a directory with a
  symlink, the old directory's files are removed from the git index via
  `git rm -r --cached`.
- **`--skip-links`** added to rclone memory pulls.

**Implementation impact:** The skill detection loop (lines 540–570) that emits
`SKILLS:name1,name2` warnings is the exact code that needs modification for
`skill-routes.json`. Currently it checks: (1) is symlink → skip, (2) is toolkit
copy → skip, (3) is git-tracked → skip, (4) else → unbackedup. The plan's
`SKILLS:unrouted:name` format needs to replace step 4 with a `skill-routes.json`
lookup. The existing `_UNBACKEDUP_SKILLS` variable and `SKILLS:` prefix should
be replaced with `_UNROUTED_SKILLS` and `SKILLS:unrouted:`.

### `contribution-detector.sh` — minor

- Sources `hook-preamble.sh`
- Wraps tracker update in `_capture_err`
- No structural changes relevant to §8

**Implementation impact:** The plan's change (skip skills already routed as
`"contribute"` or `"none"`) can be added by reading `skill-routes.json` in the
file-filtering loop (lines 64–109), filtering out any file under
`skills/<name>/` where `<name>` has a route of `"contribute"` or `"none"`.

---

## New Capabilities

### §7 — Backend Reconfiguration

Full interactive reconfiguration of sync backends within `/sync` itself.
Users should not need to re-run the setup wizard to swap a backend.

#### Flow

1. Show current backend config:
   ```
   Backend    Status           Config
   Drive      active           gdrive:Claude/Backup/personal/
   GitHub     active           git@github.com:user/claude-backup.git
   iCloud     not configured
   ```

2. Ask what they want to do:
   - Add a new backend
   - Remove an existing backend
   - Change settings for an existing backend (repo URL, Drive root, iCloud path)
   - Test all backends

#### Adding a backend

- Pick which (Drive / GitHub / iCloud)
- Walk through setup (rclone remote exists? GitHub repo exists? iCloud path valid?)
- Run full round-trip test (write temp file → read back → verify content → delete)
- On success → update `config.json` `PERSONAL_SYNC_BACKEND` list, confirm
- On failure → show actionable error, offer to retry or skip

**Note (v1.1):** `personal-sync.sh` now reads config via three separate
`node -e` calls (one per variable) instead of a single multivalue read. When
§7 updates `config.json`, the individual-variable parsing will pick up the
change correctly on the next sync cycle — no special reload needed. Also note
that `config.local.json` now holds machine-specific keys (`platform`,
`toolkit_root`, `gmessages_binary`, `gcloud_installed`) and is excluded from
sync (`personal-sync.sh` line 38). §7 must only modify `config.json`, never
`config.local.json`.

#### Removing a backend

- Confirm removal ("your data on this backend won't be deleted, just no longer synced to")
- Update `config.json`, confirm

#### Testing backends

- Round-trip test on each configured backend
- Report per-backend: write ✓/✗, read ✓/✗, delete ✓/✗, latency
- Actionable errors for failures (e.g., "rclone auth expired — run `rclone config reconnect gdrive:`")

**Note (v1.1):** Use `_capture_err` (from `hook-preamble.sh`) for test
operations so failures are logged to `backup.log` with detail. The personal-sync
mutex should be respected — if a sync is running (lock dir exists with live PID),
warn the user and offer to wait or skip the test. The `--skip-links` flag must
be included in any rclone test operations to match the current sync behavior.

---

### §8 — Skill Backup Management

Per-skill routing to one of three destinations, with proactive detection and
contribution PR tracking.

#### Routing options (per skill)

1. **Personal sync** — back up to configured backends
2. **No backup** — skip this skill (lives only in the toolkit install)
3. **Contribute to DestinClaude** — fork/branch/PR immediately via existing
   `/contribute` machinery, keep personal-syncing as safety net until PR merged

#### Flow

1. Show current skill routing table:
   ```
   Skill              Backup Route         Status
   journaling         personal-sync        ✓ synced
   elections-notebook  personal-sync        ✓ synced
   announce           contribute           PR #72 open
   my-new-skill       ⚠ unrouted           —
   ```

2. If unrouted skills exist, handle those first — for each, ask which route
3. For already-routed skills, user can select any skill to change its routing

#### Contribute flow

- Delegates to existing `/contribute` machinery (fork detection, private-manifest
  filtering, branch, PR)
- Records in routing manifest with PR number
- Skill stays in personal-sync until PR status is "merged"
- Dashboard shows PR status (open / merged / closed) pulled from `gh pr view`

#### Routing manifest — `skill-routes.json`

New file: `~/.claude/toolkit-state/skill-routes.json`

```json
{
  "journaling": { "route": "personal", "since": "2026-03-20" },
  "announce": { "route": "contribute", "pr": 72, "since": "2026-03-25" },
  "my-tool": { "route": "none", "since": "2026-03-25" }
}
```

This is the **single source of truth** for skill backup routing. Replaces
skill-level entries in `contribution-tracker.json`.

#### Proactive detection

`session-start.sh` scans `~/.claude/skills/` for directories not present in
`skill-routes.json`, adds them to `.sync-warnings` as `SKILLS:unrouted:name`.
This replaces the existing `SKILLS:name` warning format (which flagged skills
not backed up to any personal-sync backend). The new format is a superset —
unrouted skills are by definition not backed up.

#### Skill-creator integration

At the end of skill creation, the skill-creator skill asks "Where should this
skill be backed up?" with the same three options and writes the choice to
`skill-routes.json`.

---

## Changes to Existing Systems

### `session-start.sh`

**Current state (post-PR #99):** The skill detection loop at lines 540–570
iterates `~/.claude/skills/*/`, skips symlinks and toolkit copies, checks git
tracking, and emits `SKILLS:name1,name2` to `.sync-warnings`.

**Required change:** Replace the unbackedup-skill detection with unrouted-skill
detection. After the existing symlink/toolkit/git-tracked checks, add a
`skill-routes.json` lookup. A skill that passes all existing skip conditions
AND is not present in `skill-routes.json` is "unrouted."

```bash
# After the existing git-tracked check (line ~564), add:
# Check skill-routes.json — if present with any route, skip
if [[ -f "$SKILL_ROUTES_FILE" ]] && command -v node &>/dev/null; then
    _ROUTE=$(node -e "
        try{const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
        console.log((r[process.argv[2]]||{}).route||'')}catch{}" \
        "$SKILL_ROUTES_FILE" "$_SKILL_NAME" 2>/dev/null) || true
    [[ -n "$_ROUTE" ]] && continue
fi
# Not routed — add to unrouted list
_UNROUTED_SKILLS="${_UNROUTED_SKILLS:+$_UNROUTED_SKILLS,}$_SKILL_NAME"
```

Change the warning format from `SKILLS:name1,name2` to
`SKILLS:unrouted:name1,name2`. Add `SKILL_ROUTES_FILE` variable near the top
of `_bg_sync_health()`.

**Use `_capture_err`** for the node call to `skill-routes.json` since the file
may not exist or may be malformed.

### `personal-sync.sh`

**Current state (post-PR #99):** The skill sync loop at lines 164–175 iterates
`~/.claude/skills/*/`, skips symlinks and toolkit-owned dirs via
`is_toolkit_owned()` (which now works correctly thanks to the `TOOLKIT_ROOT`
fix), and syncs everything else.

**Required change:** Inside the skill loop, after the `is_toolkit_owned` check,
read `skill-routes.json` for the skill's route:
- `"none"` → `continue` (skip sync)
- `"contribute"` → still sync (safety net, per D3)
- `"personal"` or absent → sync as today (backwards compatible)

Place the `skill-routes.json` read **outside** the loop (read once, reuse):
```bash
local _ROUTES_JSON=""
local _ROUTES_FILE="$CLAUDE_DIR/toolkit-state/skill-routes.json"
[[ -f "$_ROUTES_FILE" ]] && _ROUTES_JSON=$(cat "$_ROUTES_FILE" 2>/dev/null)
```

Inside the loop, use a lightweight node lookup:
```bash
if [[ -n "$_ROUTES_JSON" ]] && command -v node &>/dev/null; then
    local _route
    _route=$(node -e "try{const r=JSON.parse(process.argv[1]);
        console.log((r[process.argv[2]]||{}).route||'')}catch{}" \
        "$_ROUTES_JSON" "$skill_name" 2>/dev/null) || true
    [[ "$_route" == "none" ]] && continue
fi
```

**Note:** The mutex (lines 77–88) ensures this runs atomically — no risk of
concurrent reads/writes to `skill-routes.json` from overlapping sync instances.

### `contribution-detector.sh`

**Current state (post-PR #99):** Scans `core/`, `life/`, `productivity/`,
`modules/` for changed files since the installed version tag. Filters against
`.private-manifest` and `contribution-tracker.json`. Uses `_capture_err` for
tracker updates.

**Required change:** In the file-filtering loop (lines 64–109), when a changed
file matches `skills/<name>/*`, extract `<name>` and check
`skill-routes.json`. Skip if route is `"contribute"` (already contributed) or
`"none"` (explicitly opted out). Only suggest skills routed as `"personal"` or
not present in the manifest.

Read `skill-routes.json` once before the loop:
```bash
_SKILL_ROUTES=""
[[ -f "$STATE_DIR/skill-routes.json" ]] && \
    _SKILL_ROUTES=$(cat "$STATE_DIR/skill-routes.json" 2>/dev/null)
```

### `skill-creator` skill

Add a final step after skill creation: "Where should this skill be backed up?"
→ write choice to `skill-routes.json`.

### `/sync` SKILL.md

- §2 (dashboard) gains skill routing summary row
- §3 (warning resolution) gains `SKILLS:unrouted` warning type
- §7 (new) — Backend Reconfiguration
- §8 (new) — Skill Backup Management
- §4–§6 unchanged

### `contribution-tracker.json`

Skill-level entries migrate to `skill-routes.json`. The contribution tracker
continues to track non-skill file contributions (hook improvements, etc.).

---

## New State Files

| File | Purpose | Written by | Read by |
|------|---------|-----------|---------|
| `~/.claude/toolkit-state/skill-routes.json` | Per-skill backup routing manifest | `/sync` skill, skill-creator | personal-sync.sh, contribution-detector.sh, session-start.sh, `/sync` skill |

---

## What's NOT Changing (for this plan)

- No new hooks or scripts
- No new commands or skills
- §4 (project onboarding), §5 (force sync), §6 (path normalization) unchanged
- Git-sync.sh unchanged
- Restore workflow unchanged

**Note (v1.1):** `backup-common.sh` was previously listed as unchanged, but
`hook-preamble.sh` was added as a new shared library since this plan was
drafted. `hook-preamble.sh` is already sourced by all three target hooks and
does not need plan-level changes — just use its utilities (`register_cleanup`,
`_capture_err`) in any new code.

---

## Design Decisions

### D1: Conversational routing over subcommands

The skill asks what the user wants rather than requiring `/sync config` or
`/sync skills` syntax. Reduces cognitive load — one command, one flow.

**Why:** Users think of "sync" as one thing. Subcommand syntax fragments the
mental model and requires memorizing argument patterns.

### D2: skill-routes.json as single source of truth

Rather than splitting skill routing between `contribution-tracker.json` and a
new manifest, consolidate into one file.

**Why:** `contribution-tracker.json` tracks individual file contributions
(hook improvements, etc.) which is a different concern. Skills are atomic
units that should be routed whole.

### D3: Contributed skills keep personal-syncing until PR merged

Safety net — if the PR is closed or abandoned, the user's copy is still backed
up.

**Why:** Contributing is not the same as backing up. A rejected PR shouldn't
mean the skill vanishes from backups.

### D4: Full round-trip backend testing

Write → read → verify → delete, not just connectivity check.

**Why:** "Can I reach Drive?" doesn't catch permission issues, quota limits,
or rclone config problems. A round-trip test proves the pipeline works
end-to-end.

### D5: Hub-and-return dashboard pattern

After each action completes, return to a refreshed dashboard and offer the
menu again.

**Why:** Users often need to do multiple things (configure a backend, then
route a skill, then force sync). Returning to the hub avoids re-invoking
`/sync` repeatedly.
