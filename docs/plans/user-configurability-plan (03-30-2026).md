# User Configurability Plan

**Date:** 2026-03-30
**Scope:** Making distributed toolkit skills adaptive and configurable for all users
**Status:** Approved — not yet implemented

---

## Context

Audit of all distributed toolkit skills and systems to identify where they are too tailored to the original author's preferences, services, and lifestyle. This plan captures all approved changes.

---

## Changes

### A. Fork-File Tone
**Decision:** Leave for now. The nickname pool and roast tone remain as-is. May revisit later with a configurable tone setting (first-run choice, similar to `locations.txt` pattern).

---

### B. Calendar Service & Mapping
**Decision:** Make both the calendar service and calendar name mapping configurable.

**Details:**
- Calendar service is configurable: Google Calendar (via gws) or Apple Calendar (via apple-events MCP)
- Calendar name mapping is configurable: event type → calendar name (replacing the current hardcoded mapping)
- Stored in `config.json` under a `services.calendar` key and a `calendar_mapping` key
- Setup wizard asks which calendar service and calendar names (conditional on platform — Apple options macOS-only)

**Files affected:**
- `productivity/skills/claudes-inbox/SKILL.md` — remove hardcoded calendar mapping (lines 152-161), dispatch to configured service
- `core/skills/setup-wizard/SKILL.md` — add calendar service and mapping questions
- `~/.claude/toolkit-state/config.json` — new keys

---

### C. Journal Domains
**Decision:** Replace the 11 hardcoded domains with 7 broader defaults. Add tiered sweep and custom domain support.

**New default domains (7):**
1. Work & Career
2. Relationships & Social Life
3. Family
4. Health
5. Finances
6. Interests & Hobbies
7. Goals & Aspirations

**Tiered sweep logic:**
- **Active:** Discussed in last 3 sessions → light touch ("Anything else on X?")
- **Dormant:** Not discussed in 5+ sessions but still active → periodic resurface (rotate one per session)
- **Inactive:** Explicitly opted out → skip entirely

**Custom domains:** Users can add custom domains organically ("I want to start tracking my faith journey") or opt out of defaults ("stop asking about finances"). Domains re-enter only if the user brings them up organically.

**State tracking:** `~/.claude/journal-state.json` — tracks domain list, engagement history (last discussed, skip count), opt-outs. Included in personal-sync.

**Self-correcting defaults:** All 7 defaults start active. No upfront configuration needed. The tiered sweep adapts within 3-5 sessions based on engagement patterns.

**Files affected:**
- `life/skills/journaling-assistant/SKILL.md` — replace domain list, add tiered sweep logic, add custom domain support
- Personal-sync paths — add `journal-state.json`

---

### D. Drive Folder Sub-Paths
**Decision:** Fine as-is. `DRIVE_ROOT` provides sufficient top-level configurability.

---

### E. Inbox Output Providers
**Decision:** Make task creation and calendar event creation service-agnostic on the output side, matching the existing input provider abstraction.

**Details:**
- "Todoist tasks" classification category becomes generic "Tasks"
- Task creation dispatches to configured task manager (Todoist, Apple Reminders, or local fallback)
- Calendar event creation dispatches to configured calendar service (per item B)
- Task parking uses configured task manager instead of Todoist-specific "Claude Tasks" section
- Dependencies section becomes conditional on configured services

**New output provider files:**
- `productivity/skills/claudes-inbox/outputs/todoist-tasks.md`
- `productivity/skills/claudes-inbox/outputs/apple-reminders-tasks.md`
- `productivity/skills/claudes-inbox/outputs/google-calendar.md`
- `productivity/skills/claudes-inbox/outputs/apple-calendar.md`

**Config:**
```json
"services": {
  "task_manager": "todoist",       // or "apple-reminders", "local"
  "calendar": "google-calendar"    // or "apple-calendar"
}
```

**Setup wizard:** Two new questions (conditional on platform):
- "What task manager do you use?" → Todoist / Apple Reminders / None
- "What calendar do you use?" → Google Calendar / Apple Calendar / None

**Files affected:**
- `productivity/skills/claudes-inbox/SKILL.md` — genericize classification, dispatch to output providers
- `productivity/skills/claudes-inbox/specs/claudes-inbox-spec.md` — document output provider pattern
- `core/skills/setup-wizard/SKILL.md` — add service selection questions
- `~/.claude/toolkit-state/config.json` — new `services` keys
- New output provider instruction files (4 files)

---

### F. Encyclopedia Source Files
**Decision:** 7 core files + user-defined custom files via manifest.

**Core files (7, always present):**
1. Core Identity
2. Status Snapshot
3. People Database
4. Chronicle
5. Open Threads and Goals
6. Preferences and Reference Data
7. Values and Worldview (renamed from "Beliefs and Positions" — broadened to cover political, religious, philosophical, ethical, and professional values)

**Removed from core:** "Predictions" — becomes an optional custom file for users who want formal prediction tracking.

**Manifest:** `~/.claude/encyclopedia/manifest.json` — lists all files (core + custom) with description and scope. Included in personal-sync.

**Manifest structure (hybrid routing):**
```json
{
  "files": [
    {
      "name": "Values and Worldview",
      "file": "Values and Worldview.md",
      "core": true,
      "description": "Political, religious, philosophical, and ethical positions with evolution logs",
      "scope": ["political positions", "religious beliefs", "ethical frameworks", "philosophical views", "admired figures", "worldview evolution"]
    },
    {
      "name": "Predictions",
      "file": "Predictions.md",
      "core": false,
      "description": "Forecasts with confidence levels, revision logs, and resolution verdicts",
      "scope": ["predictions", "forecasts", "confidence assessments", "prediction resolutions"]
    }
  ]
}
```

**Custom file creation flow:**
1. User expresses intent to track something new
2. Skill drafts description and scope
3. **Overlap detection** — checks against every existing file's scope. If overlap found, surfaces it: "This overlaps with [file], which already covers [topics]. Do you want to narrow the scope, or would the existing file work?"
4. User confirms or adjusts
5. File created, manifest updated

**Files affected:**
- `life/skills/encyclopedia-update/SKILL.md` — routing table reads from manifest, scope-based matching for custom files
- `life/skills/encyclopedia-compile/SKILL.md` — reads manifest for available files
- `life/skills/encyclopedia-interviewer/SKILL.md` — gap detection reads manifest
- `life/skills/encyclopedia-librarian/SKILL.md` — search scope reads manifest
- All encyclopedia specs — update to document manifest system
- Personal-sync paths — add `manifest.json`
- Setup wizard or first-run — create initial manifest with 7 core files

---

### G. Compiled Encyclopedia Output
**Decision:** Ship a default section structure, make it configurable via manifest.

**Default sections (5 narrative + 4 appendices):**

| Section | Draws From | Covers |
|---|---|---|
| I. Identity & Background | Core Identity, Chronicle, People Database | Origin, childhood, family, formative events, values |
| II. Education & Career | Core Identity, Status Snapshot, Chronicle, People Database | Academic and professional arc as one continuous story |
| III. Values & Worldview | Values and Worldview, Core Identity, Predictions (if exists) | What they believe and why — political, religious, philosophical, ethical |
| IV. Relationships & Social Life | People Database, Status Snapshot, Chronicle | Partner, friends, family dynamics, social life |
| V. Lifestyle & Interests | Status Snapshot, Preferences, Chronicle | Health, hobbies, finances, day-to-day life |

**Appendices (unchanged):**
- A. People Index
- B. Timeline
- C. Tastes & Preferences
- D. Quick Reference

**Configurability:** Section structure stored in manifest. Users can add, remove, or reorder sections. Custom source files feed into whichever section covers related content.

**Files affected:**
- `life/skills/encyclopedia-compile/SKILL.md` — read section structure from manifest instead of hardcoding
- `~/.claude/encyclopedia/manifest.json` — add `compile_sections` key

---

### H. Journaling Political Probes
**Decision:** Remove hardcoded political domain special handling. Replace with a general principle.

**New behavior:** When conversation touches on values, beliefs, or worldview topics (political, religious, philosophical, ethical), the journaling skill leans in with deeper probing:
- Evolution questions: "Has your thinking changed on this?"
- Reasoning questions: "What's driving that view?"
- Prediction questions (if Predictions file exists): "How confident are you? What would change your mind?"

This fires based on conversational content, not a specific domain label. Any values/worldview topic gets this treatment when it comes up organically.

**Files affected:**
- `life/skills/journaling-assistant/SKILL.md` — remove political-specific probes, add general worldview probing principle

---

### I. Personal Examples in Skill Files
**Decision:** Genericize life-specific references in distributed skill files.

**References to replace:**

`life/skills/encyclopedia-compile/SKILL.md`:
- Line 96: "foster care specifics, etc." → generic sensitive biographical example
- Line 105: "has explored psychedelics in intentional settings" → generic substance use example
- Line 116: "EDM/festivals, reading, hiking, technology" → generic interests example
- Line 329: "Festival/Rave Crew, Page Program Friends, etc." → generic group examples

`life/skills/encyclopedia-librarian/SKILL.md`:
- Line 81: "foster care specifics" → same as compile
- Line 211: "brief me on the festival crew" → generic group query example
- Line 346: "The festival crew arc" → generic topic synthesis example

**Files affected:**
- `life/skills/encyclopedia-compile/SKILL.md`
- `life/skills/encyclopedia-librarian/SKILL.md`

---

## Implementation Order (Suggested)

1. **I** — Personal examples (cosmetic, zero risk, quick)
2. **H** — Political probes (small change in one file)
3. **C** — Journal domains (self-contained in journaling skill + new state file)
4. **B + E** — Calendar/task service abstraction (interconnected changes in inbox skill + setup wizard)
5. **F + G** — Encyclopedia manifest system (largest change, touches all encyclopedia skills)
6. **A** — Fork-file tone (deferred)
