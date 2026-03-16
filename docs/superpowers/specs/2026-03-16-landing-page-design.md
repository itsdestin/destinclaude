# ClaudifestDestiny Landing Page Design

**Goal:** A single-page site that non-technical friends can open from a text message, understand what the toolkit does, and install it — without ever seeing GitHub.

**Hosting:** GitHub Pages serving from `site/` directory on master branch.

## Architecture

Single self-contained `site/index.html`. All CSS inline (no external stylesheets, no build tools, no JavaScript frameworks). Zero dependencies. Must render well on mobile (friends will open from a text message link).

## Page Sections

### 1. Hero
- Project name (ClaudifestDestiny) + tagline: "A modular toolkit that transforms Claude Code into a personal knowledge system."
- 2-sentence description with personal warmth: built for friends, shared with everyone.
- Inline link: "New to Claude Code?" → beginner's guide.

### 2. What's Inside
Four cards, one per layer:
- **Core** — Foundation hooks, specs system, memory, commands
- **Life** — Journaling, encyclopedia, Google Drive sync
- **Productivity** — Inbox processing, Todoist, text messaging
- **Modules** — Domain-specific tools (elections, fiscal notes)

Scannable — short descriptions, not paragraphs. Inline link: "Want the technical details?" → system architecture.

### 3. Install
- Tab/toggle between Mac/Linux and Windows
- One command each (the bootstrap one-liner)
- Below: "Then open Claude and say **set me up**."
- Expandable hints: "What's a terminal?" and "What's PowerShell?" — collapsed by default, don't clutter the main flow
- Minimal JS only for tab toggle and expandable hints (no frameworks)

### 4. Documentation
Grid of 4 linked cards:
| Card | Links To | Description |
|------|----------|-------------|
| Quickstart | `docs/quickstart.md` | Already use Claude Code? Start here. |
| Beginner's Guide | `docs/for-beginners/00-what-is-claude.md` | Never used Claude Code? Start here. |
| System Architecture | `docs/system-architecture.md` | Technical deep dive for power users. |
| Specs Index | `core/specs/INDEX.md` | Feature documentation and design decisions. |

Links point to GitHub-rendered markdown (e.g., `https://github.com/itsdestin/claudifest-destiny/blob/master/docs/quickstart.md`).

### 5. Footer
- "Built by Destin" + GitHub repo link
- MIT license note
- Minimal, understated

## Visual Direction

- **Dark background** with light text — matches terminal aesthetic
- **Accent color** for interactive elements, card borders, highlights
- **Typography:** Monospace for code/commands, clean sans-serif (system font stack) for prose
- **Responsive:** Mobile-first. Cards stack vertically on narrow screens. Install commands remain readable on phone width.

## What This Page Does NOT Do
- No JavaScript frameworks or build step
- No analytics or tracking
- No signup, email capture, or cookies
- No duplicated documentation content — links to GitHub-rendered markdown
- No video (may be added later)
