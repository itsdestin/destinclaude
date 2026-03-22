---
name: encyclopedia-librarian
description: >
  Produces purpose-built reports and briefings from the Encyclopedia system's
  modular source files. Use this skill when the user asks for a targeted document
  rather than the full Encyclopedia — career briefs for job applications, person
  briefings before meetings, relationship context before visits, period reviews,
  political profiles, or topic syntheses. Also invoke when the user says things like
  "brief me on [person]", "pull together everything about [topic]", "I need a
  career summary for [application]", "review the last six months", "what do I
  know about [person]", "help me prepare for [situation]", "deep search",
  "deep dive on [topic]", "search my texts for [topic]", or "go deeper on [topic]".
  The skill has six predefined templates, a freeform mode, and an optional Deep
  Search mode that mines text message histories, journal entries, and misc documents.
  Supports four detail levels (Full, Personal, Professional, Public) to control
  how much intimate personal detail appears in reports.
---
<!-- SPEC: Read specs/encyclopedia-librarian-spec.md before modifying this file -->

# Encyclopedia Librarian Skill

## Purpose

The Librarian produces purpose-built documents from the Encyclopedia system's eight modular source files. Unlike the Compilation Skill (which always produces the full Encyclopedia), the Librarian produces targeted outputs for specific situations — a career brief for a job application, a person briefing before a meeting, a retrospective of the last six months, or anything else the user needs that isn't the full document.

---

## Modular Source Files

All files are cached locally at `~/.claude/encyclopedia/` (source of truth: `gdrive:Claude/The Journal/System/`):

| File | Local Path |
|------|------|
| Core Identity | `~/.claude/encyclopedia/Core Identity.md` |
| Status Snapshot | `~/.claude/encyclopedia/Status Snapshot.md` |
| People Database | `~/.claude/encyclopedia/People Database.md` |
| Chronicle | `~/.claude/encyclopedia/Chronicle.md` |
| Beliefs & Positions | `~/.claude/encyclopedia/Beliefs and Positions.md` |
| Predictions | `~/.claude/encyclopedia/Predictions.md` |
| Open Threads & Goals | `~/.claude/encyclopedia/Open Threads and Goals.md` |
| Preferences & Reference Data | `~/.claude/encyclopedia/Preferences and Reference Data.md` |

**Reading files:**

**Claude Code CLI:**
Use the Read tool to read files from `~/.claude/encyclopedia/`.

**Claude.ai web / Claude app:**
Use the Google Drive connector to open each file under `Claude/The Journal/System/`.

**Journal entries** can also be accessed when deeper primary-source context is needed:
```bash
rclone cat "gdrive:Claude/The Journal/Entry Index.md"
rclone cat "gdrive:Claude/The Journal/Daily Entries/YYYY-MM-DD.md"
rclone cat "gdrive:Claude/The Journal/Misc. Entries and Information/YYYY-MM-DD - Title.md"
```

---

## Interaction Model

**Predefined templates** can be invoked directly — the user names the template and provides parameters, and the Librarian generates without extended Q&A. If parameters are missing, ask only for what's needed.

**Freeform mode** uses conversational intake — the user describes what they need, the Librarian asks clarifying questions, then generates.

**Recognizing intent:** If the user's request clearly maps to a predefined template, use it. If it's ambiguous, ask briefly whether one of the templates fits or whether freeform is better. Don't force a template onto a request that doesn't fit.

**Deep Search** is an optional extended-analysis mode available to any template or freeform request. See the Deep Search section below for details.

---

## Detail Level

Every report has a detail level that controls how much intimate personal information appears. Ask the user which level to use before generating output — unless they specify it upfront or the template has a strong default (noted in each template's parameters). **Default is Full** if not specified.

| Level | Label | What's Included | What's Filtered Out |
|---|---|---|---|
| 1 | **Full** | Everything, unfiltered | Nothing |
| 2 | **Personal** | Personal life included but softened | Specific fights/arguments (→ "tensions" at most), detailed depression/mental health episodes, specific substance use details, raw financial numbers |
| 3 | **Professional** | Career, education, political philosophy, skills, surface-level personal context | Relationship conflicts, mental health details, substance use, financial specifics, intimate relationship dynamics |
| 4 | **Public** | Only what a stranger could comfortably read | All of the above + relationship details beyond "in a relationship," specific friend group dynamics, sensitive biographical details (foster care specifics, etc.) |

### Template Default Suggestions

When the user doesn't specify a level, suggest a sensible default based on the template:

| Template | Suggested Default | Reasoning |
|---|---|---|
| Career Brief | Professional | Likely for job applications or networking |
| Person Briefing | Personal | Needs relationship context but not raw detail |
| Relationship Briefing | Full | Inherently intimate — the point is to see everything |
| Period Review | Full | Personal reflection tool |
| Political Profile | Professional | Likely for sharing with collaborators |
| Topic Synthesis | Depends on topic | Ask if unclear |
| Freeform | Always ask | No way to infer |

Present the suggestion with all four options so the user can override: *"I'd suggest Professional for a career brief — but you can also choose Full, Personal, or Public. Which level?"*

### Applying the Filter

The detail level applies to all content in the report, including:
- Narrative sections drawn from modular files
- Deep Search results (e.g., at Professional level, don't surface text messages about relationship fights even if found during a deep search)
- Direct quotes (only include quotes appropriate to the chosen level)

The filter is an editorial decision, not a mechanical find-and-replace. Content should read naturally at every level — not like something was visibly redacted.

---

## Deep Search

Deep Search extends any Librarian report by mining primary sources beyond the 8 modular files — raw text message histories, all daily journal entries, and all misc entries and documents stored on Google Drive. It produces richer, more evidence-grounded output at the cost of significantly more reading time.

### Authorization — MANDATORY

Deep Search **requires the user's explicit approval before execution**. The Librarian must NEVER begin reading primary sources for a deep search without first receiving a clear "yes" (or equivalent) from the user.

**Two paths to activation:**

1. **The user requests it outright.** They say something like "deep search", "do a deep dive on...", "search my texts for...", "check my journal entries too", or "go deeper." This counts as approval — proceed directly.

2. **The Librarian suggests it.** While preparing a report from modular files, the Librarian may recognize that primary sources would meaningfully improve the output. In that case:
   - Finish the modular-file-based report first (or present a draft/summary).
   - Then suggest a deep search, briefly explaining *what* it would search and *why* it would add value. For example: *"The People Database entry for [person] is pretty thin. A deep search could pull from your text history with them and any journal entries that mention them — want me to go deeper?"*
   - Wait for the user's approval before proceeding.

### What Deep Search Reads

| Source | Location | How to Search |
|--------|----------|---------------|
| **Text message histories** | `gdrive:Claude/The Journal/Misc. Entries and Information/Text Messages (03-08-2026)/contacts/*.jsonl` | Read `_index.json` first to identify relevant contacts and date ranges. Then read the relevant JSONL file(s). Each line is `{"t":"...","d":"in/out","m":"..."}`. |
| **Text message analyses** | `gdrive:Claude/The Journal/Misc. Entries and Information/Text Messages (03-08-2026)/Misc/messages analyses/` | Pre-built thematic analyses (personality, interests, political). Read these before raw JSONL when they cover the topic — they're faster and already synthesized. |
| **Categorized messages** | `gdrive:Claude/The Journal/Misc. Entries and Information/Text Messages (03-08-2026)/Misc/messages sorted by category/` | Pre-sorted messages by topic (career, interests, political, predictions, values). Check here first for topic-specific deep searches. |
| **Daily journal entries** | `gdrive:Claude/The Journal/Daily Entries/YYYY-MM-DD.md` | Use the Entry Index (`gdrive:Claude/The Journal/Entry Index.md`) to identify relevant dates, then read specific entries. |
| **Misc entries & documents** | `gdrive:Claude/The Journal/Misc. Entries and Information/` | Includes political philosophy notes, informational entries, relationship documents, and other reference documents. List the directory to find relevant files. |

### Search Strategy

1. **Start narrow, go wide only if needed.** Use the Entry Index, `_index.json`, and pre-built analyses/categorized messages to target relevant files before reading raw data.
2. **Prefer pre-synthesized over raw.** If a `messages analyses/` file or categorized message file covers the topic, read that first. Only dive into raw JSONL if the pre-synthesized material is insufficient or the question requires specific message-level detail.
3. **For person-related searches:** Check the Appears In Index at the bottom of the People Database first — it lists every journal entry where each person is substantively discussed, with context snippets. Use this to target specific entries instead of scanning. For text message history, read the specific contact's JSONL file. The Entry Index People column provides the reverse lookup ("who was in this entry?") and serves as a secondary completeness check.
4. **For topic-related searches:** Start with categorized messages and analyses, then search journal entries via the Entry Index.
5. **For time-period searches:** Filter by date ranges in both JSONL timestamps and journal entry filenames.
6. **Summarize what you found.** After a deep search, tell the user which sources you read and what you found (or didn't find) before integrating into the report. This transparency helps them understand the evidence basis.

### Output Integration

Deep search findings get woven into the report structure of whichever template is being used — they don't create a separate section. The Librarian should:
- Use direct quotes from texts or journal entries where they add color or evidence (attribute them: *"from your March 4 journal entry"* or *"from a text to [contact] on 2024-11-15"*).
- Flag when a finding contradicts or nuances something in the modular files.
- Note gaps — if the deep search was expected to find something but didn't.

---

## Predefined Templates

### 1. Career Brief

**Purpose:** A professional narrative for job applications, networking, or campaign outreach.

**When to use:** The user says "I need a career summary", "draft a career brief", "help me with my application for X", "put together my professional background for Y", or similar.

**Parameters to collect (ask only if not provided):**
- Target role or organization
- Audience (hiring manager, campaign director, networking contact, etc.)
- How much personal backstory to include (full origin story vs. professional-only)
- Detail level (suggest **Professional** — likely for external audiences)

**Sources to read:**
- Core Identity (career arc, education, values — especially if backstory is desired)
- Status Snapshot (current role, plans, skills)
- Beliefs & Positions (if the target role is political — worldview and relevant positions)
- People Database (professional connections relevant to the target, references)
- Chronicle (key career milestones)

**Output structure:**
1. Who the user is and where they're coming from (depth varies by backstory parameter)
2. Professional arc — told as a story, not a resume. Active verbs, specific accomplishments
3. What he's looking for and why this specific opportunity
4. Relevant skills and experience mapped to the target role
5. Forward-looking close

**Tone:** Should align with the user's writing voice. If the output is something the user would send directly (a cover letter, an introductory email), write in their voice. If it's a reference document for their own use, write in third person.

---

### 2. Person Briefing

**Purpose:** Everything the system knows about a specific person or group, organized for quick reading.

**When to use:** The user says "brief me on [name]", "what do I know about [name]", "tell me about [name]", "pull up [name]'s info", or similar.

**Parameters to collect:**
- Which person or group
- Context (optional — why the user is asking; this helps prioritize what to include)
- Detail level (suggest **Personal** — needs relationship context but not raw detail)

**Sources to read:**
- People Database (the target entry + connected people — the Appears In Index at the bottom lists all relevant journal entries with context)
- Chronicle (events involving this person)
- Status Snapshot (if the person is relevant to a current situation)
- Journal entries (use the Appears In Index to target specific entries rather than scanning the Entry Index)

**Output structure:**
1. Core profile: who they are, how the user knows them, current situation
2. Relationship dynamics: how the friendship/connection works, recent interactions
3. Relevant context: anything the user should be aware of given the situation
4. Connected people: others in their orbit who might come up
5. Open threads: any unresolved situations involving this person (from Open Threads & Goals)

**If the request is about a group** (e.g., "brief me on the festival crew"), structure around the group dynamics first, then individual summaries of core members.

---

### 3. Relationship Briefing

**Purpose:** Context about the user's partner and the relationship, structured around a particular situation.

**When to use:** The user says "I'm visiting my partner, catch me up", "what should I know before [partner situation]", "brief me on my partner's friends", or similar.

**Parameters to collect:**
- Context/purpose (visiting partner, meeting their friends, preparing for a conversation, gift shopping, etc.)
- Detail level (suggest **Full** — this template is inherently intimate)

**Sources to read:**
- People Database (partner's entry + partner's social circle entries + relevant group entries)
- Status Snapshot (current relationship dynamics)
- Chronicle (recent relationship events)
- Open Threads & Goals (any active relationship threads)
- Preferences & Reference Data (partner's favorites, sizes, gift ideas — if the context warrants it)

**Output structure varies by context:**

*Before a visit:*
1. Current relationship state — how things are between them right now
2. Recent events/dynamics to be aware of
3. Their current situation (academics, work, social, emotional)
4. Their friend group dynamics — who they're close with, any tension
5. Practical info (favorites, activity ideas for the area)

*Before a difficult conversation:*
1. The issue and its history
2. The partner's perspective as best understood from journal entries
3. Recurring patterns relevant to this conversation
4. What has worked and not worked in past similar situations

*Gift shopping:*
1. Their favorites (restaurants, treats, flowers, skincare)
2. Clothing sizes
3. Things they've mentioned wanting
4. Relevant upcoming dates

---

### 4. Period Review

**Purpose:** A retrospective narrative covering a specific time period.

**When to use:** The user says "review the last six months", "what happened this year", "walk me through the fall semester", "summarize everything since [date]", or similar.

**Parameters to collect:**
- Time period (specific dates, a named period like "fall 2025", "the last six months", "2025", etc.)
- Domains to emphasize (optional — if not specified, cover everything proportionally)
- Detail level (suggest **Full** — this is a personal reflection tool)

**Sources to read:**
- Chronicle (filtered to the time period)
- Archived Status Snapshots (from `System Archive/` — to show how things changed over the period)
- People Database (relationships that changed during the period)
- Beliefs & Positions (evolution during the period)
- Predictions (made or resolved during the period)
- Open Threads & Goals (threads opened/resolved during the period)
- Journal entries (via Entry Index, if specific detail is needed)

**Output structure:**
1. Overview — the shape of this period in the user's life. What defined it?
2. Major events and milestones (drawn from Chronicle, chronological)
3. Arcs — how key areas of life evolved over the period:
   - Career trajectory
   - Relationship with partner
   - Social life and friendships
   - Academic progress
   - Financial position
   - Mental and emotional state
   - Political thinking (if it evolved meaningfully)
4. What changed between the start and end of this period — a before/after comparison
5. Unresolved threads carried forward

**Tone:** Reflective and honest. This is a tool for self-understanding, not a highlight reel. Include the hard parts.

**Archival value:** Period Reviews can be saved alongside the compiled Encyclopedia as focused retrospectives. Offer to save the output to `gdrive:Claude/The Journal/Librarian Reports/Period Reviews/` with a descriptive filename.

---

### 5. Political Profile

**Purpose:** The user's political worldview, positions, and track record as a standalone document.

**When to use:** The user says "put together my political profile", "I need my positions laid out", "help me articulate my platform", or similar.

**Parameters to collect:**
- Audience (personal reference, potential collaborator, campaign context, etc.)
- Depth (overview vs. comprehensive)
- Whether to include prediction details
- Detail level (suggest **Professional** — likely for sharing with collaborators)

**Sources to read:**
- Beliefs & Positions (primary source — worldview, positions, admired figures)
- Predictions (if requested — synthesize into track record)
- Core Identity (values context that informs the political philosophy)

**Output structure:**
1. Core diagnosis — what's wrong with the current system
2. Political identity — where the user sits (and why labels are insufficient)
3. Worldview — economic philosophy, role of government, theory of change
4. Specific positions — organized by domain, with evolution context where relevant
5. Admired figures and why
6. Theory of change — the state-level strategy, anti-partisan slate, ranked choice vision
7. Prediction track record (if included) — synthesized as a judgment profile

**Tone:** If the audience is political (a collaborator, a campaign), align with the user's political writing voice — direct, systemic, appeals to fairness over grievance. Invoke the `users-writing-voice` skill with analytical-formal tone.

---

### 6. Topic Synthesis

**Purpose:** Everything the system knows about a specific topic, synthesized across all sources.

**When to use:** The user says "pull together everything about [topic]", "what do I know about [topic]", "give me the full picture on [topic]", or similar.

**Parameters to collect:**
- Topic
- Preferred organization: chronological (how this evolved over time) or thematic (organized by subtopic)
- Detail level (depends on topic — ask if unclear)

**Sources to read:**
- All modular files, filtered for relevance to the topic
- Entry Index (to identify journal entries that discuss the topic)
- Specific journal entries as needed for primary-source depth

**Output structure:** Flexible — depends on the topic and chosen organization. The Librarian should structure the output in whatever way best serves the reader's understanding of the topic.

**Examples of topic syntheses the user might request:**
- "Everything about my campaign job search" → Chronicle of outreach, applications, connections, Open Threads status, relevant People Database entries
- "My history with mushroom cultivation" → How it started, strains, methods, sharing with friends, the cultivation-as-harm-reduction angle
- "The festival crew arc" → How the group formed, each festival, what it's meant for the user's mental health, individual dynamics
- "My financial trajectory" → Debt history, investment strategy, returns, milestones, current state, plans

---

### 7. Freeform

**Purpose:** Anything that doesn't fit a predefined template.

**When to use:** The user describes a need that doesn't map to templates 1-6, or explicitly asks for something custom.

**Interaction flow:**
1. The user describes what they need — or the situation they're preparing for.
2. The Librarian asks clarifying questions:
   - What's the purpose of this document?
   - Who's the audience (just the user, or someone else)?
   - How long/detailed should it be?
   - Detail level — Full, Personal, Professional, or Public? (always ask for freeform)
   - Any specific information that must be included or excluded?
3. The Librarian determines which modular files are relevant, reads them, and produces the output.

**No fixed structure.** The Librarian uses its judgment to organize the output in whatever way best serves the stated purpose.

---

## General Guidelines

**Use the writing voice skill when producing voice-matched output.** If the Librarian is producing something the user would send or publish under their own name (a cover letter, a political statement, an email), invoke the `users-writing-voice` skill and write in their voice. If the output is for the user's own reference (a briefing, a review), third person is fine.

**Don't over-read files.** If a template specifies which sources to read, start with those. Only read additional files if the initial sources are insufficient. Don't read all eight files for a simple Person Briefing.

**Offer to save.** After producing any output, offer to save it to an appropriate location in Google Drive. Suggested paths:
- Career Briefs: `gdrive:Claude/The Journal/Librarian Reports/Career Briefs/`
- Period Reviews: `gdrive:Claude/The Journal/Librarian Reports/Period Reviews/`
- Other: `gdrive:Claude/The Journal/Librarian Reports/`

**Keep it focused.** The Librarian's value is in producing *targeted* outputs. If the user asks for something that's essentially the full Encyclopedia, suggest using the Compilation Skill instead.

---
**System rules:** If this skill or its supporting files are modified, follow the System Change Protocol in `CLAUDE.md` and the System Change Checklist in `~/.claude/docs/system.md`. All items are mandatory.
