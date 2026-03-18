---
name: Landing Page
version: 1.3
last_updated: 2026-03-18
---

# Landing Page Spec

A single-page site that non-technical friends can open from a text message, understand what the toolkit does, and install it — without ever seeing GitHub.

**Live URL:** https://itsdestin.github.io/destinclaude/
**Source:** `docs/index.html` (served via GitHub Pages from `master` branch, `/docs` path)

## Architecture

Single self-contained `docs/index.html`. CSS inline, fonts loaded from Google Fonts (JetBrains Mono + DM Sans). Minimal JS for tab toggle and copy-to-clipboard. No frameworks, no build step, no dependencies. `.nojekyll` file in `docs/` prevents Jekyll from processing markdown files alongside the HTML. Orange diamond SVG favicon inline in `<head>`.

## Page Sections

### 1. Hero
- Title box with warm orange tint: "Destin**Claude**" (second word in accent color) + "For Claude Code by Anthropic" subtitle
- Personal warmth line: "Built for my friends. Shared with everyone."

### 2. What Is This? (Intro)
- Section label: "What is this?"
- Heading: "Meet your new personal assistant."
- Bordered card explaining Claude's capabilities (create files, search web, open apps, navigate screen)
- Permission note in accent italic: "Nothing happens without your permission."

### 3. Before You Begin (Prerequisites)
- Section label: "Before you begin"
- Heading: "You'll need a couple of accounts."
- Three prerequisite cards, each with name-first layout, right-aligned account links, and color-coded badges:
  - **Anthropic** (Required, Paid — $20) — API key or Claude Max subscription
  - **Google or Apple** (Required, Free) — for Drive/iCloud backup and services
  - **GitHub** (Required, Free) — required to receive toolkit updates
- PAID/FREE badges: orange background for paid, green background for free
- Reassurance note in accent-bordered box: Claude handles connecting each service during setup

### 4. Install (Step 1)
- Section label: "Get started"
- Heading: "Step 1: Run the installer"
- Tab toggle between Mac/Linux and Windows (ARIA tab roles)
- Each tab includes terminal-opening instructions before the command
- Mac/Linux: `curl -fsSL ... -o /tmp/install.sh && bash /tmp/install.sh`
- Windows: `powershell -ExecutionPolicy Bypass -c "iwr -useb ... -OutFile install.ps1; .\install.ps1"`
- Orange "Copy" button on each command block

### 5. Talk to Claude (Step 2)
- Heading: "Step 2: Talk to Claude"
- Bordered card with glow effect containing:
  - `$ claude` command box
  - `> Set me up.` command box (Claude Code prompt style)
  - Explanation text + WARNING label about expected red error text and confirmation prompts
- "While you wait" links: beginner's guide + documentation section anchor

### 6. What's Inside (Features)
- Heading: "Claude helps install what you need."
- Four cards in 2x2 grid (stacks to 1-column on mobile), one per layer:
  - **Core** (diamond icon) — Foundation hooks, specs, memory, commands
  - **Life** (star icon) — Journaling, encyclopedia, Google Drive sync
  - **Productivity** (lightning icon) — Inbox processing, Todoist, text messaging
  - **Modules** (cross-diamond icon) — Domain-specific optional add-ons
- Icons are Unicode characters in warm orange badge containers
- Dependency note with "Want the technical details?" → system architecture

### 7. Integrations
- Positioned between prerequisites and the install step
- Intro text: "DestinClaude integrates with the services you already use."
- Flexbox row of integration tags (pill-shaped), each with:
  - Icon (via Wikimedia Commons SVGs for Google/Apple services, Simple Icons CDN for others, Google Favicons as fallback)
  - Service name
  - `data-desc` attribute with expandable description (click/tap to toggle)
  - Descriptions use consistent "DestinClaude can..." phrasing
- Integrations listed: Google Drive, Google Docs, Google Sheets, Google Slides, Google Calendar, Gmail, Google Messages, iMessage, iCloud, Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Todoist, GitHub, Chrome, Safari, Canva
- "More coming soon..." pill in dimmed style (`.soon` class)
- Active integration shows description below the tag row with subtle animation

### 8. Documentation
- 2x2 grid of linked cards with hover arrow reveal:

| Card | Links To | Description |
|------|----------|-------------|
| Quickstart | `docs/quickstart.md` | Already use Claude Code? Four steps and you're done. |
| Beginner's Guide | `docs/for-beginners/00-what-is-claude.md` | Never used Claude Code? Start from the very beginning. |
| System Architecture | `docs/system-architecture.md` | Technical deep dive into layers, hooks, specs, and data flow. |
| Specs Index | `core/specs/INDEX.md` | Feature documentation and design decisions. |

### 9. Footer
- "Built by Destin" (links to GitHub profile)
- GitHub repo link + "MIT License"

## Visual Design

- **Background:** Warm cream (`#faf6f1`) with subtle warm radial gradients
- **Surface colors:** Cards white (`#ffffff`), hover `#fef9f4`
- **Text:** Primary `#2d2418`, secondary `#6b5d4f`, dim `#9a8d7f`
- **Accent:** Burnt orange `#e07840` for links, borders, highlights, badges
- **Code blocks:** Warm beige (`#f0e8de`) with dark text
- **Typography:** DM Sans for prose (400/500/600/700), JetBrains Mono for code and labels
- **Borders:** Subtle `rgba(45, 36, 24, 0.1)`, accent borders `rgba(224, 120, 64, 0.3)`
- **Card glow:** `0 0 40px rgba(224, 120, 64, 0.12)` on all bordered cards
- **Animations:** Staggered fade-up on page load (hero elements)
- **Responsive:** Breakpoint at 768px — all grids collapse to single column

## Hosting Configuration

- GitHub Pages source: `master` branch, `/docs` path
- `.nojekyll` file prevents Jekyll processing
- `gh-pages` branch exists but is not the active source
- No custom domain configured (uses `itsdestin.github.io/destinclaude/`)

## Planned Updates

*None — all previously planned items have been implemented.*

## Changelog

- **v1.3 (2026-03-18):** Documented implemented Integrations section (18 services with icons, expandable descriptions, "More coming soon" pill). Updated hero title from "Claudifest Destin-y" to "DestinClaude". Updated prerequisites: GitHub changed to Required, Google changed to "Google or Apple", added PAID/FREE badges, name-first card layout with right-aligned links. Added section numbering for Integrations (new section 7), renumbered Documentation to 8 and Footer to 9.
- **v1.2 (2026-03-17):** Added Planned Updates section with integrations icons feature request (from inbox 2026-03-17).
- **v1.1 (2026-03-17):** Updated to reflect warm cream/orange color scheme, added sections 2 (What Is This?), 3 (Before You Begin), 5 (Step 2: Talk to Claude). Removed tagline from hero, added title box with subtitle. Updated all color values.
- **v1.0 (2026-03-16):** Initial spec — dark navy/teal theme.
