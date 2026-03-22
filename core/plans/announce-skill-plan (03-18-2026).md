# Announce Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a private GitHub repo (`itsdestin/destinclaude-admin`) with a single `announce` skill for creating, clearing, and viewing the DestinClaude announcement broadcast.

**Architecture:** A new private repo holds one skill file (`skills/announce/announce.md`) that is symlinked into `~/.claude/skills/announce`. The skill detects intent from natural language, gathers missing inputs conversationally, then writes `announcements.txt` in the DestinClaude repo and pushes to `master`. The DestinClaude `core/specs/INDEX.md` gets a new External Admin Tooling section pointing to the private repo.

**Tech Stack:** Markdown skill file (Claude Code skill format), Bash (git operations), GitHub CLI (`gh`) for repo creation

**Design doc:** `core/plans/announce-skill-design (03-18-2026).md`

---

## File Map

| Action | File | What it does |
|--------|------|-------------|
| Create (new repo) | `destinclaude-admin/skills/announce/announce.md` | The skill — intent detection, flows, git operations |
| Create (new repo) | `destinclaude-admin/README.md` | Setup instructions + symlink command |
| Modify | `destinclaude/core/specs/INDEX.md` | Add External Admin Tooling section |

---

## Task 1: Create the `destinclaude-admin` private repo on GitHub

**Files:**
- Create: local folder + remote repo

- [ ] **Step 1: Create the local repo folder**

```bash
mkdir -p ~/destinclaude-admin/skills/announce
cd ~/destinclaude-admin
git init
```

- [ ] **Step 2: Create the GitHub repo (private)**

```bash
gh repo create itsdestin/destinclaude-admin --private --description "Owner-only admin tools for DestinClaude" --confirm
git remote add origin https://github.com/itsdestin/destinclaude-admin.git
```

If `gh` is not available, create the repo manually at https://github.com/new, then run:
```bash
git remote add origin https://github.com/itsdestin/destinclaude-admin.git
```

- [ ] **Step 3: Verify the remote is set correctly**

```bash
git remote -v
# Expected:
# origin  https://github.com/itsdestin/destinclaude-admin.git (fetch)
# origin  https://github.com/itsdestin/destinclaude-admin.git (push)
```

---

## Task 2: Create the `announce.md` skill file

**Files:**
- Create: `~/destinclaude-admin/skills/announce/announce.md`

This is the entire skill. It must handle three flows (create / clear / view) from natural language, gather missing inputs conversationally, and run git operations against the hardcoded DestinClaude repo path.

- [ ] **Step 1: Create the skill file**

```markdown
---
name: announce
description: Manage DestinClaude announcements. Use when the user says "create/post/set an announcement", "clear/remove the announcement", or "what's the current announcement"/"show the announcement".
---

# Announce — DestinClaude Admin Skill

You manage the live announcement broadcast for DestinClaude via `announcements.txt` in the repo.

## Repo Details

- **Repo path:** `/c/Users/desti/.claude/plugins/destinclaude`
- **File:** `announcements.txt` (repo root)
- **Branch:** `master` (always — never `main`)
- **Cache:** `~/.claude/.announcement-cache.json` (read-only from this skill)

## File Format

```
# With expiry (auto-clears after date passes):
2026-03-25: New skill drop — update now!

# Without expiry (stays until manually cleared):
Hey friends — check the new journaling skill!

# Empty file = no announcement shown to users
```

Rules:
- First non-empty, non-comment line is used
- `YYYY-MM-DD: message` sets an expiry (zero-padded)
- Non-matching first line = message with no expiry
- Empty file = no announcement

---

## Detect Intent

Read the user's message and determine which flow to run:

- **Create:** mentions "create", "post", "set", "send", "broadcast", "new announcement", or provides message text directly
- **Clear:** mentions "clear", "remove", "delete", "empty", "take down" the announcement
- **View:** mentions "current", "show", "what is", "status", "check" the announcement

If intent is ambiguous, ask: "Do you want to create a new announcement, clear the current one, or view what's live?"

---

## Create Flow

**Goal:** Write a new message to `announcements.txt`, commit, push.

1. **Gather message** — if not already provided, ask: "What's the announcement message?"
2. **Gather expiry** — if not mentioned, ask: "Any expiry date? Format: YYYY-MM-DD (or press enter to skip)"
   - Validate format if provided: must match `YYYY-MM-DD` (zero-padded). If invalid, ask again.
   - If skipped: no expiry
3. **Compose the line:**
   - With expiry: `YYYY-MM-DD: message`
   - Without expiry: `message`
4. **Show preview:**
   ```
   Will post: ★ [message]  (expires YYYY-MM-DD)
   ```
   or
   ```
   Will post: ★ [message]  (no expiry)
   ```
   Ask: "Looks good? (yes/no)"
5. **On confirm — run these commands:**

```bash
REPO="/c/Users/desti/.claude/plugins/destinclaude"
# Verify the file exists
if [ ! -f "$REPO/announcements.txt" ]; then
  echo "ERROR: Expected $REPO/announcements.txt — is the DestinClaude repo at that location?"
  exit 1
fi
# Write the announcement
echo "ANNOUNCEMENT_LINE" > "$REPO/announcements.txt"
# Commit and push
cd "$REPO"
git add announcements.txt
git commit -m "feat: set announcement — MESSAGE_PREVIEW"
git push origin master
```

Replace `ANNOUNCEMENT_LINE` with the composed line and `MESSAGE_PREVIEW` with a short (≤50 char) version of the message.

6. **Report success:**
   ```
   ✓ Announcement live. Users will see: ★ [message]
   It will appear on their next session start.
   ```

---

## Clear Flow

**Goal:** Empty `announcements.txt`, commit, push.

1. **Read the current file:**
```bash
cat /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
```

2. **If already empty** (no non-comment, non-blank lines) → say "No active announcement to clear." and stop.

3. **Show what will be cleared:**
   ```
   Current announcement: ★ [message]
   Clear it? (yes/no)
   ```

4. **On confirm — run:**
```bash
REPO="/c/Users/desti/.claude/plugins/destinclaude"
> "$REPO/announcements.txt"
cd "$REPO"
git add announcements.txt
git commit -m "chore: clear announcement"
git push origin master
```

5. **Report success:**
   ```
   ✓ Announcement cleared. Users will see no announcement on next session start.
   ```

---

## View Flow

**Goal:** Show the current state without modifying anything.

1. **Read `announcements.txt`:**
```bash
cat /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
```

Parse the first non-empty, non-comment line:
- If matches `YYYY-MM-DD: message` → message = part after `: `, expires = date
- If plain text → message = the line, no expiry
- If empty/comment-only → no active announcement

2. **Read cache** (for last-fetched time only):
```bash
cat ~/.claude/.announcement-cache.json 2>/dev/null
```
Extract `fetched_at` field.

3. **Display:**
```
Current announcement:  [message]  OR  (none)
Expires:               [YYYY-MM-DD]  OR  never
Last synced locally:   [fetched_at formatted]  OR  not yet fetched
```

---

## Error Handling

| Error | Response |
|-------|----------|
| `announcements.txt` missing | "Expected file at `/c/Users/desti/.claude/plugins/destinclaude/announcements.txt` — is the DestinClaude repo at that location?" |
| `git push` fails | Show the raw git error output. Do not retry. |
| File already empty (clear) | "No active announcement to clear." — stop, no commit. |
| User cancels at confirm | "Cancelled. No changes made." |
```

- [ ] **Step 2: Verify the file was created**

```bash
ls -la ~/destinclaude-admin/skills/announce/announce.md
# Expected: file exists
```

---

## Task 3: Create `README.md`

**Files:**
- Create: `~/destinclaude-admin/README.md`

- [ ] **Step 1: Create the README**

```markdown
# destinclaude-admin

Private owner-only tools for [DestinClaude](https://github.com/itsdestin/destinclaude).

## Skills

| Skill | Purpose |
|-------|---------|
| `announce` | Create, clear, and view the DestinClaude announcement broadcast |

## Setup

Clone this repo, then symlink skills into your Claude skills directory:

```bash
git clone https://github.com/itsdestin/destinclaude-admin.git ~/destinclaude-admin

# Symlink the announce skill
ln -sf ~/destinclaude-admin/skills/announce ~/.claude/skills/announce
```

Then verify Claude picks it up:
```bash
ls ~/.claude/skills/announce/
# Expected: announce.md
```

## Usage

In any Claude Code session, invoke by natural language:

- **Create:** "create an announcement: New skill drop!" or "post an announcement"
- **Clear:** "clear the announcement"
- **View:** "show the current announcement"

## Requirements

- DestinClaude installed at `/c/Users/desti/.claude/plugins/destinclaude`
- Git configured with push access to `itsdestin/destinclaude` (master branch)
- Claude Code with skills directory at `~/.claude/skills/`
```

- [ ] **Step 2: Verify**

```bash
cat ~/destinclaude-admin/README.md
# Expected: README content visible
```

---

## Task 4: Initial commit and push to GitHub

**Files:**
- All files in `~/destinclaude-admin/`

- [ ] **Step 1: Stage and commit**

```bash
cd ~/destinclaude-admin
git add .
git commit -m "feat: add announce skill for destinclaude admin"
```

- [ ] **Step 2: Push to GitHub**

```bash
git push -u origin master
# Expected: Branch 'master' set up to track remote branch 'master' from 'origin'
```

- [ ] **Step 3: Verify on GitHub**

```bash
gh repo view itsdestin/destinclaude-admin
# Expected: shows private repo with 1 commit
```

---

## Task 5: Symlink the skill locally

**Files:**
- Symlink: `~/.claude/skills/announce` → `~/destinclaude-admin/skills/announce`

- [ ] **Step 1: Create the symlink**

```bash
ln -sf ~/destinclaude-admin/skills/announce ~/.claude/skills/announce
```

- [ ] **Step 2: Verify the symlink resolves**

```bash
ls ~/.claude/skills/announce/
# Expected: announce.md
cat ~/.claude/skills/announce/announce.md | head -5
# Expected: frontmatter with name: announce
```

- [ ] **Step 3: Verify skill is available in Claude Code**

Open a new Claude Code session (or reload skills) and run:
```
What skills do you have available related to announcements?
```
Expected: Claude mentions the `announce` skill.

---

## Task 6: Update `core/specs/INDEX.md` in DestinClaude

**Files:**
- Modify: `/c/Users/desti/.claude/plugins/destinclaude/core/specs/INDEX.md`

- [ ] **Step 1: Add External Admin Tooling section**

Append to the end of `core/specs/INDEX.md`:

```markdown

## External Admin Tooling

Tools for the repo owner that live in a separate private repo and are never distributed to public DestinClaude users.

| Tool | Repo | Purpose |
|------|------|---------|
| announce | [itsdestin/destinclaude-admin](https://github.com/itsdestin/destinclaude-admin) (private) | Owner-only skill for creating/clearing/viewing announcements |
```

- [ ] **Step 2: Verify the addition**

```bash
tail -12 /c/Users/desti/.claude/plugins/destinclaude/core/specs/INDEX.md
# Expected: External Admin Tooling section with announce row
```

- [ ] **Step 3: Commit and push**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add core/specs/INDEX.md
git commit -m "docs: add External Admin Tooling section to INDEX.md"
git push origin master
```

---

## Task 7: Smoke test end-to-end

- [ ] **Step 1: Test the view flow**

In Claude Code, say: "show the current announcement"
Expected: Claude reads `announcements.txt` (empty) and reports "no active announcement"

- [ ] **Step 2: Test the create flow**

Say: "create an announcement: Testing the announce skill — expires 2099-12-31"
Expected:
- Claude shows preview: `★ Testing the announce skill`
- On confirm: writes, commits, pushes
- Reports success

- [ ] **Step 3: Verify the push landed**

```bash
cat /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
# Expected: 2099-12-31: Testing the announce skill — expires 2099-12-31
```

- [ ] **Step 4: Test the clear flow**

Say: "clear the announcement"
Expected:
- Claude shows current message, asks to confirm
- On confirm: empties file, commits, pushes

- [ ] **Step 5: Verify cleared**

```bash
cat /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
# Expected: empty
```
