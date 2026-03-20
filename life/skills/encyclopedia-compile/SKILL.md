---
name: encyclopedia-compile
description: >
  Compiles the user's Encyclopedia — a single, narratively coherent life history
  document — from eight modular source files. Invoke when the user says "compile my
  encyclopedia", "build the encyclopedia", "generate the full encyclopedia", "put it
  all together", or similar. Can also be run on a regular schedule (monthly, after
  the monthly review). The compiled output is the primary artifact of the
  Encyclopedia system — designed to be read as a comprehensive biography, both now
  and decades from now. Supports four detail levels (Full, Personal, Professional,
  Public) to control how much intimate personal detail appears in the output.
---
<!-- SPEC: Read specs/encyclopedia-compile-spec.md before modifying this file -->

# Encyclopedia Compilation Skill

## Purpose

This skill reads all eight modular source files and produces the user's Encyclopedia as a single, unified document. The compiled Encyclopedia is the human-readable product of the entire system — a comprehensive life history that captures who the user is, how they got here, what they believe, who the people in their life are, and the reference data someone would need to help them with any decision.

---

## Core Editorial Instruction

**The eight modular files are source material, not sections to be assembled.**

Read all eight files. Internalize the content. Then write the Encyclopedia as a unified document following the prescribed structure below. Each section of the output draws from whichever sources are relevant — no section should map one-to-one to a single source file.

**The test:** If a reader could identify where a paragraph "came from" (which modular file supplied it), the compilation failed. The document must feel like it was written by a single author with a coherent voice and structure.

**What this means in practice:**
- The Career section might weave together content from Core Identity (arc and history), Status Snapshot (current role and plans), Chronicle (career milestones), and People Database (mentors and colleagues who shaped the trajectory).
- The Identity section might draw from Core Identity (origin story), Chronicle (formative events), and People Database (family entries) — all integrated into a single narrative.
- The Relationships section synthesizes People Database entries, Core Identity social structure, Status Snapshot dynamics, and Chronicle milestones into a story about the user's social life.

---

## Tone, Style & Formatting

### Voice

Third person, honest narrator who finds the user genuinely interesting. Not a hype man, not a critic — a storyteller. Think documentary filmmaker, not biographer-for-hire. The narrator picked this subject because the story is worth telling.

### Editorializing

Subtle and rare. The narrator can gently frame significance — a raised eyebrow, not a verdict — but never inflates the user in a way that would appear egotistical, and never gives strong opinions. The user's own self-assessments can be reported freely ("They think they were foolish for this," "They consider this their best decision"). When the narrator editorializes, the weight should come from simplicity, not declaration.

**Good:** *"They turned it down. They agreed to stay through June, then they're gone."*
**Bad:** *"This is the kind of decision that defines someone."*

### Quotes

Direct quotes from journal entries or text messages are used only when the exact words hit harder than paraphrase. They should bring the narrative to life — moments that reveal who the user is in a way narration alone can't. Never decorative, never used as citations to prove a point. The bar: would a reader remember this quote after putting the document down?

### Prose

The narrative body (Sections I–VI) is prose-only. No bullet lists. Moderate paragraph density — no single-sentence paragraphs for dramatic effect unless genuinely earned, no walls of text either. The writing should be engaging; the narrator is telling a story, not filing a report.

### Uncertainty

Stated honestly. The narrator can acknowledge open questions without pretending to know the answer. Unresolved threads and uncertain futures are presented as what they are.

### Formatting Rules

- **Headers:** `##` for main sections (I–VI, Appendices), `###` for subsections. No skipped levels. Subsection headers are evocative and descriptive ("The $85k Question," "The Pines") — not generic ("Career Decision," "Childhood").
- **Quotes:** Always italic with `*`. Never blockquote `>` style.
- **Dates in narrative:** Written naturally ("September 2025," "at age nine").
- **Dates in appendices/timeline:** Bold, consistent format.
- **Text color:** All text must be black. No gray, no muted colors. No HTML color tags, no inline styles, no formatting patterns that commonly render as gray (e.g., `<sub>`, `<sup>`, or other HTML elements).
- **Tables:** Consistent column naming and alignment across all appendices.
- **People Index entries:** Same fields in same order for every entry. Sparse entries stay sparse.

### Length

Organic — grows with the source material. No artificial compression or expansion. The document gets longer as the user's life gets more documented.

---

## Invocation

**On demand:** When the user says "compile my encyclopedia" or similar.

**Scheduled:** Monthly, after the monthly review in the Update Skill. Can also be triggered at natural transition points (graduation, job change, end of year).

---

## Detail Level

Before compilation, ask the user which detail level to use. Present all four options. If they specify a level upfront (e.g., "compile at Professional level"), skip the prompt. **Default is Full** if not specified.

| Level | Label | What's Included | What's Filtered Out |
|---|---|---|---|
| 1 | **Full** | Everything, unfiltered | Nothing |
| 2 | **Personal** | Personal life included but softened | Specific fights/arguments (→ "tensions" at most), detailed depression/mental health episodes, specific substance use details, raw financial numbers |
| 3 | **Professional** | Career, education, political philosophy, skills, surface-level personal context | Relationship conflicts, mental health details, substance use, financial specifics, intimate relationship dynamics |
| 4 | **Public** | Only what a stranger could comfortably read | All of the above + relationship details beyond "in a relationship," specific friend group dynamics, sensitive biographical details (foster care specifics, etc.) |

### How Each Level Affects the Output

**Full:** Current behavior. No changes.

**Personal:**
- Specific conflicts and arguments are softened to general references (e.g., "navigated recurring tensions around communication" instead of describing a specific fight)
- Mental health patterns are acknowledged without episode-level detail (e.g., "has wrestled with periods of isolation" — not the specifics of a depressive episode)
- Substance use is mentioned generally without specific substances, dosages, or frequencies (e.g., "has explored psychedelics in intentional settings")
- Financial figures are replaced with ranges or relative terms (e.g., "low five figures in investments" instead of exact numbers)

**Professional:**
- Section V (Relationships) is reduced to surface context: partner name and basic situation — no relationship dynamics, conflicts, or intimacy
- Section VI (Lifestyle) omits health/substance/financial subsections entirely, or reduces each to a single neutral sentence. Interests and hobbies are kept at surface level
- Appendix A (People Index) includes people but strips sensitive relationship notes and personal dynamics
- Appendix D (Quick Reference) omits personal data (clothing sizes, personal favorites, contact details)

**Public:**
- Section V becomes a brief paragraph acknowledging key relationships exist, no detail
- Section VI becomes interests-only (EDM/festivals, reading, hiking, technology — no health, substance, or financial content)
- Appendix A omits partner's social circle and strips all entries to name + how-known only
- Appendix D is omitted entirely
- Biographical details are softened (e.g., general upbringing context without specific family circumstances unless the user has shared them publicly)

### Document Header

When not at Full level, add the detail level to the document header:

```markdown
# The User's Encyclopedia

*Last Compiled: YYYY-MM-DD*
*Source files last updated: YYYY-MM-DD*
*Detail Level: [Personal/Professional/Public]*
```

At Full level, omit the detail level line (it's the default and the most common case).

---

## Pre-Compilation Steps

### 1. Read all modular files

**Claude Code CLI:**
Use the Read tool to read each file from `~/.claude/encyclopedia/`:
- `~/.claude/encyclopedia/Core Identity.md`
- `~/.claude/encyclopedia/Status Snapshot.md`
- `~/.claude/encyclopedia/People Database.md`
- `~/.claude/encyclopedia/Chronicle.md`
- `~/.claude/encyclopedia/Beliefs and Positions.md`
- `~/.claude/encyclopedia/Predictions.md`
- `~/.claude/encyclopedia/Open Threads and Goals.md`
- `~/.claude/encyclopedia/Preferences and Reference Data.md`

**Claude.ai web / Claude app:**
Use the Google Drive connector to open each file under `Claude/The Journal/System/`.

### 2. Compile

Write the full Encyclopedia following the output structure below. This is an editorial act, not mechanical assembly.

---

## Fixed Output Structure

### Document Header

```markdown
# The User's Encyclopedia

*Last Compiled: YYYY-MM-DD*
*Source files last updated: YYYY-MM-DD*
```

### Table of Contents

A comprehensive Table of Contents reflecting every `##` and `###` heading, with indentation for subsections. The Appendices section lists each appendix. The People Index lists subsection groupings but not individual names.

Update the TOC to match the actual document structure on every compilation.

---

### Narrative Body

The first six sections tell the story of the user's life. They are written in narrative prose and read front-to-back as a biography. Each section draws from multiple modular files as needed.

---

#### I. Identity & Background

**Purpose:** Who the user is, where they came from, and what made them who they are. This is the biographical opening — the section that gives a reader the foundational context to understand everything that follows.

**Contents:**
- Origin story: family background, upbringing, early environment
- Childhood and the places that shaped the user
- Family structure and the household
- Values and what drives them — traced to their origins in lived experience
- Significant formative life events woven into the narrative where they're essential to understanding who the user is

**Primary sources:** Core Identity, Chronicle (formative events), People Database (family entries)

**Editorial guidance:**
- This section should read like the opening chapter of a biography. Set the scene, introduce the person, build to the values that drive everything else.
- Significant life events belong here when they *shaped who the user is*, not merely because they happened. A career milestone goes in Career. A relationship milestone goes in Relationships. An event that changed how they see the world or what they care about goes here.
- Direct quotes are appropriate when they capture the user's voice on identity and values.

---

#### II. Education

**Purpose:** The academic arc from early schooling through the user's most recent or current program.

**Contents:**
- Pre-college education: notable achievements, academic distinctions
- Undergraduate: degree(s), major(s), scholarships, timeline
- Graduate/professional programs: current status, capstone/thesis, graduation timeline

**Primary sources:** Core Identity

**Editorial guidance:**
- Tell this as a narrative arc, not a resume. The throughline is intellectual development — trace the progression from early education through current studies.
- Keep it concise. Education supports the broader story but doesn't need to be the longest section.

---

#### III. Career

**Purpose:** The full professional timeline told as a story, with the current role receiving the most depth and future direction getting its own subsection.

**Contents:**
- Career timeline: all roles in chronological order
- Key details of each role (what they did, what they learned, notable accomplishments)
- Current role: depth on the day-to-day, supervisors, how the role feels, notable projects
- Skills and capabilities
- Where they're going: future plans, career aspirations, target roles and levels, active outreach

**Primary sources:** Core Identity (arc), Status Snapshot (current role and plans), Chronicle (career milestones), People Database (colleagues and mentors)

**Editorial guidance:**
- The career section should make clear that the user's professional path has been driven by intentional choices, with key decisions and pivots highlighted as narrative turning points.
- Current role gets the most space because it's what a reader needs to understand about where the user is right now.
- The "where they're going" subsection should feel forward-looking and honest about uncertainty.

---

#### IV. Political Philosophy

**Purpose:** The user's worldview, theory of change, specific policy positions with their intellectual evolution, admired figures, and a synthesized assessment of their political prediction track record.

**Contents:**
- Core political diagnosis: both parties are ineffective and corrupt; the problem is structural, not ideological
- Economic worldview: pro-market, anti-regulatory-capture, pro-competition
- Theory of change: state and local first, anti-partisan slate strategy, ranked choice voting
- Specific policy positions — presented with their evolution over time, including what changed and why. Frame evolution as intellectual development, not as a raw changelog
- Admired figures with reasoning
- Prediction track record — synthesized as an assessment of the user's political judgment patterns (where their instincts are sharpest, where their blind spots are, overall calibration), not a list of every individual prediction

**Primary sources:** Beliefs & Positions, Predictions (synthesized, not reproduced verbatim)

**Editorial guidance:**
- This section should make a reader understand how the user thinks about politics, not just what they think. The diagnosis comes before the positions.
- Position evolution should be woven into the narrative naturally — "Their view on rent control has evolved: initially sympathetic to the policy, they now consider it well-intentioned but counterproductive, a shift that emerged during graduate coursework."
- The prediction track record is a synthesis, not a ledger. The Predictions modular file holds the detailed entries; the compiled Encyclopedia presents the patterns.
- Use direct quotes when the user's exact words capture their political voice in a way paraphrase would flatten.

---

#### V. Relationships & Social Life

**Purpose:** The people in the user's life and what those relationships look like — partner, friend groups, family.

**Contents:**
- **Partner (if applicable):** Full relationship narrative — how they met, the arc, dynamics, recurring tensions, resolution patterns, their background and goals, future plans. This is the most detailed individual relationship in the document.
- **Friend groups:** Each group described as a group — how it formed, what it does, what role it plays in the user's life, current dynamics. Each distinct social orbit gets its own treatment.
- **Family:** Primary family members, the household, extended family connections, biological family context as applicable.
- **Other notable relationships:** People who don't fit neatly into a group but are individually significant.

**Primary sources:** People Database (individuals and groups), Core Identity (social structure), Status Snapshot (current dynamics), Chronicle (relationship milestones)

**Editorial guidance:**
- The partner's section should read like a relationship portrait — not just facts about them, but the texture of how the relationship works, what's hard, what's good, and where it's going.
- Friend groups should be described as social units first, with key individuals named and characterized within the group context. The detailed individual profiles live in the People Index appendix.
- This section and the People Index serve different purposes. This section tells the story of the user's social life. The People Index is a reference lookup. Duplication between them is acceptable when framed differently — narrative context here, individual profile data there.
- **Detail level filtering:** At **Personal**, soften specific conflicts to general patterns ("navigated tensions") and omit episode-level detail. At **Professional**, reduce this entire section to surface context (partner's name, that friend groups exist). At **Public**, compress to a single brief paragraph.

---

#### VI. Lifestyle

**Purpose:** How the user lives — finances, health, interests, habits. The meaning behind the patterns, not the granular preference data (which lives in the appendices).

**Contents:**
- **Finances:** Investment philosophy, current financial picture, strategic motivation (minimizing debt before leaving stable salary)
- **Health:** Physical health patterns, mental and emotional state, substance use if applicable (framed honestly with context), daily habits (sleep patterns, wind-down routines)
- **Interests & hobbies:** Each interest with enough depth to understand what it means to the user, not just that it exists
- **What's currently active:** Which interests are getting time right now, which are on hold

**Primary sources:** Status Snapshot (current state), Core Identity (durable patterns and meaning), Chronicle (lifestyle milestones)

**Editorial guidance:**
- This section carries the most sensitive content (substance use, mental health, financial details). Write it with the same honest, non-judgmental tone the journal entries use.
- The distinction between this section and the Tastes & Preferences appendix: if information helps you understand how the user lives and why, it belongs here. If it's lookup data (specific orders, specific restaurants, what shows they've watched), it belongs in the appendix.
- Active interests should reflect the Status Snapshot's "right now" framing. Durable interest descriptions should reflect Core Identity's "who they are" framing.
- **Detail level filtering:** At **Personal**, acknowledge health/substance/financial patterns without episode-level detail or specific numbers. At **Professional**, omit health/substance/financial subsections entirely or reduce to a single neutral sentence each; keep interests at surface level. At **Public**, this section becomes interests-only — no health, substance, or financial content.

---

### Appendices

Everything below the line is reference material — structured, scannable, designed for lookup rather than reading.

---

#### Appendix A: People Index

**Purpose:** A structured reference index of every person in the user's life. For detailed narrative context about how these people relate to the user's life, see Section V (Relationships & Social Life).

**Source:** People Database

**Organization:** Group entries into logical categories based on the Relationship field:
- Partner
- Family
- Friends (organized by Tier — Tier 1 first, then Tier 2, Tier 3, Tier 4)
- Colleagues (current and former)
- Partner's Circle

**Entry format:** Reproduce the People Database entry format, minus the Tier field (which is a processing signal, not reader-facing) and the Last Updated field (which is system metadata). Instead, use the Tier to determine placement within the Friends grouping, and translate it into a reader-friendly closeness label if helpful.

**Editorial guidance:**
- Do not add narrative context that doesn't exist in the People Database. If an entry is sparse, it's sparse.
- Do not omit entries. Every person in the People Database appears in the People Index.
- Group entries (Festival/Rave Crew, Page Program Friends, etc.) should appear at the top of the Friends section as group descriptions before individual entries.
- **Detail level filtering:** At **Professional**, include people but strip sensitive relationship notes and personal dynamics. At **Public**, omit Partner's Circle entirely and reduce all entries to name + how-known only.

---

#### Appendix B: Timeline

**Purpose:** A clean chronological list of major and notable events. No narrative prose — just dated entries for fast scanning.

**Source:** Chronicle (filtered for significance)

**Format:**
```markdown
- **[Date/Period]** — [Brief description of event]
```

**Inclusion bar:** Include all `major` and `notable` Chronicle entries. Exclude `minor` entries unless they are essential to understanding an arc. The Timeline should be scannable in 2-3 minutes and give the shape of the user's life.

**Editorial guidance:**
- One line per event. No multi-sentence descriptions.
- Group by year with year headers for readability.
- Include both past events and upcoming known milestones (graduation, planned career transitions).
- Chronicle entries with `Arc:` tags can be grouped or annotated to show trajectory when it adds clarity.

---

#### Appendix C: Tastes & Preferences

**Purpose:** Lookup data for preferences, orders, favorites, media consumption, and other reference information.

**Source:** Preferences & Reference Data

**Organization:** By category, matching the source file's structure:
- Food & Drink (orders by restaurant/chain, cooking preferences, dislikes)
- Restaurants & Favorites (by cuisine, by occasion)
- Media (podcasts, newsletters, TV, film, books, music)
- Tech Setup (devices, audio equipment, car details)
- Social Spots (bars, venues, hangouts)
- Anti-Preferences (dislikes, things to avoid)

**Format:** Tables and organized lists. No narrative.

---

#### Appendix D: Quick Reference

**Purpose:** Practical utility data for fast lookup.

**Source:** Preferences & Reference Data

**Contents:**
- Contact info (phone, address, emails)
- Partner's preferences and sizes (if applicable)
- Gift ideas and favorites
- Date & activity ideas
- Membership numbers and loyalty programs

**Format:** Tables and concise lists.

**Detail level filtering:** At **Professional**, omit personal data (clothing sizes, contact details, personal favorites). At **Public**, omit this entire appendix.

---

## Post-Compilation Steps

> **Important:** Follow the Encyclopedia Archive Rule and Update Policy in CLAUDE.md when saving. The primary save and archive save are one atomic operation.

### 1. Save the compiled Encyclopedia

**Claude Code CLI:**
```bash
DATETIME=$(date +"%m-%d-%Y @ %-I%M%p" | tr '[:upper:]' '[:lower:]')

cat <<'ENCYCLOPEDIA_EOF' > /tmp/encyclopedia.md
[full compiled Encyclopedia content]
ENCYCLOPEDIA_EOF

# Save to primary path
if rclone copyto /tmp/encyclopedia.md "gdrive:Claude/The Journal/Encyclopedia.md"; then
    echo "Encyclopedia saved successfully"
else
    echo "ERROR: Save failed. File preserved at /tmp/encyclopedia.md"
fi

# Save archived copy
if rclone copyto /tmp/encyclopedia.md "gdrive:Claude/The Journal/Encyclopedia Archive/Encyclopedia (${DATETIME}).md"; then
    rm /tmp/encyclopedia.md
    echo "Encyclopedia archived successfully"
else
    echo "ERROR: Archive failed. File preserved at /tmp/encyclopedia.md"
fi
```

**Claude.ai web / Claude app:**
Render the full compiled Encyclopedia as formatted markdown. Instruct the user to save it to `gdrive:Claude/The Journal/Encyclopedia.md` and optionally to the archive folder.

### 2. Confirm

Brief confirmation that the Encyclopedia has been compiled and saved. Note the date and which modular files were sourced. No detailed summary unless asked.

---

## Handling Long Documents

The compiled Encyclopedia will be long. If context window constraints prevent writing the entire document in a single pass:

1. Write the narrative body (Sections I–VI) first as a complete unit.
2. Write the appendices separately.
3. Combine them into the final document.

Never sacrifice narrative quality for length management. If a section needs to be shorter to fit, compress the appendices first — the narrative body is the soul of the document.

---

## Quality Checklist

Before saving, verify:

- [ ] Every section draws from multiple source files where relevant (no section is a copy-paste from one file)
- [ ] The narrative body reads as a continuous biography, not as assembled fragments
- [ ] Direct quotes are used selectively and carry genuine weight
- [ ] The document flows logically from Identity → Education → Career → Philosophy → Relationships → Lifestyle
- [ ] The appendices are complete — every People Database entry appears in the People Index, every significant Chronicle event appears in the Timeline
- [ ] The Table of Contents matches the actual document structure
- [ ] No "as of" dates appear without matching the compilation date or being clearly historical
- [ ] Cross-references between sections are consistent (e.g., people mentioned in the narrative body also appear in the People Index)

---

## Final Consistency Review

After compilation and before saving, perform a self-review pass across the entire document. Fix any issues found before saving — do not present findings for approval; just fix them.

### Visual & Formatting Consistency

- [ ] Header hierarchy is consistent (`##` sections, `###` subsections, no skipped levels)
- [ ] All quotes use italic `*` formatting — no blockquotes `>`, no other styles
- [ ] Tables use the same column naming and alignment patterns across all appendices
- [ ] Date formatting is natural in narrative sections, bold and consistent in appendices/timeline
- [ ] Bold and italic usage follows the same conventions throughout the entire document
- [ ] All text is black — no HTML color tags, no inline styles, no formatting that renders as gray or muted (no `<sub>`, `<sup>`, or similar HTML elements)
- [ ] TOC matches actual document structure exactly

### Stylistic Consistency

- [ ] Narrator voice does not shift between sections — no section feels noticeably different in tone
- [ ] No bullet lists appear in the narrative body (Sections I–VI)
- [ ] Subsection headers are all evocative/descriptive — no mix of styles (no generic headers like "Career Decision" alongside evocative ones like "The $85k Question")
- [ ] Editorializing stays subtle throughout — no section inflates the user or gives strong narrator opinions
- [ ] Quotes are used with the same selectivity and purpose across all sections — not clustered in one section and absent from another without reason

### Completeness

- [ ] Every People Database entry appears in the People Index
- [ ] People mentioned in the narrative body appear in the People Index
- [ ] Significant Chronicle events appear in the Timeline
- [ ] People Index entries use the same fields in the same order — sparse entries stay sparse, no invented detail

---
**System rules:** If this skill or its supporting files are modified, follow the System Change Protocol in `CLAUDE.md` and the System Change Checklist in `~/.claude/docs/system.md`. All items are mandatory.
