# Announce Skill — Design

**Date:** 2026-03-18
**Status:** Implemented
**Feature:** Owner-only skill for managing DestinClaude announcements from a private GitHub repo

---

## Purpose

Provide the DestinClaude repo owner (Destin) with a conversational skill for creating, clearing, and viewing the live announcement broadcast in `announcements.txt`. Lives in a separate private GitHub repo so it is never distributed to public DestinClaude users.

---

## Repository

**Repo:** `itsdestin/destinclaude-admin` (private)

**Structure:**
```
destinclaude-admin/
├── README.md                    ← setup instructions + symlink command
└── skills/
    └── announce/
        └── announce.md          ← the skill file
```

**Installation (one-time, manual):**
```bash
# Path depends on where you cloned destinclaude-admin — substitute your actual clone path
ln -sf /path/to/your/clone/destinclaude-admin/skills/announce ~/.claude/skills/announce
```

No `plugin.json`, no hooks, no layers. Just the skill and docs.

---

## Branch & Path Notes

**Target branch:** `master` (the DestinClaude repo uses `master`, not `main`). The skill must always push to `master`. The fetch URL in `announcement-fetch.js` also uses `.../destinclaude/master/announcements.txt` — these must stay in sync. Never use `main` in git commands or URLs for this repo.

**Hardcoded repo path:** `/c/Users/desti/.claude/plugins/destinclaude`
(Personal owner tool — no path discovery needed)

---

## Skill Behavior

**Trigger phrases:** "create/post/set an announcement", "clear/remove the announcement", "what's the current announcement", "show the announcement"

### Create Flow
1. If message is in the invocation → use it
2. If no message → ask for it
3. If expiry date mentioned → use it; if not → ask "Any expiry date? (or press enter to skip)"
4. Show preview: `★ [message]` (with expiry if set)
5. On confirm → write `announcements.txt`, `git add announcements.txt`, `git commit -m "feat: set announcement — [message]"`, `git push`

### Clear Flow
1. Show the current message if one exists (read from `announcements.txt`)
2. If already empty → say so, no commit made, stop
3. Ask to confirm
4. On confirm → empty `announcements.txt`, `git add announcements.txt`, `git commit -m "chore: clear announcement"`, `git push`

### View Flow
1. Parse `announcements.txt` (source of truth) for current message and expiry date
2. Read `~/.claude/.announcement-cache.json` for `fetched_at` only — this shows when users last synced
3. Display:
   - **Message:** (from `announcements.txt`, or "none" if empty)
   - **Expires:** (from `announcements.txt` date prefix, or "never")
   - **Last synced by this machine:** (from `cache.fetched_at`, or "not yet fetched")

Note: `announcements.txt` is always authoritative for message/expiry. The cache only contributes `fetched_at`.

---

## Data Flow

```
User invokes skill
  → Detect intent (create / clear / view)
  → Gather missing inputs conversationally
  → Preview + confirm (create and clear only)
  → Write announcements.txt
  → git add announcements.txt   ← only this file, never git add .
  → git commit -m "[message]"
  → git push (master)
  → Report success with what users will see
```

**Git staging:** Always use `git add announcements.txt` explicitly — never `git add .` or `git add -A`. Other uncommitted changes in the repo are the owner's concern and must not be swept into the announcement commit.

**announcements.txt format (reference):**
```
# With expiry (auto-clears after date):
2026-03-25: New skill drop — update now!

# Without expiry (stays until manually cleared):
Hey friends — check the new journaling skill!

# Empty file = no announcement
```

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `git push` fails (no auth, network error) | Surface raw git error, stop |
| `announcements.txt` not found at hardcoded path | Clear message: "Expected file at `/c/Users/desti/.claude/plugins/destinclaude/announcements.txt` — is the DestinClaude repo at that location?" |
| File already empty on clear | Say so, no commit made |

No retry logic, no fallbacks — direct error surfacing is sufficient for a personal owner tool.

---

## Documentation Targets

- Design doc: `core/plans/announce-skill-design (03-18-2026).md` (this file)
- Plan doc: `core/plans/announce-skill-plan (03-18-2026).md` (implementation checklist)
- README.md in `destinclaude-admin` repo: setup + usage reference
- DestinClaude `core/specs/INDEX.md`: add a new "External Admin Tooling" section with one entry:
  ```
  | announce | itsdestin/destinclaude-admin (private) | Owner-only skill for creating/clearing/viewing announcements |
  ```

---

## Accepted Limitations

| Limitation | Decision |
|------------|----------|
| Hardcoded repo path | Accepted — owner-only tool, no need for portability |
| No validation of message content | Accepted — owner controls the message |
| No undo after push | Accepted — clearing is one command away |
| Dirty working tree not checked | Accepted — only `announcements.txt` is staged; other changes are owner's responsibility |
