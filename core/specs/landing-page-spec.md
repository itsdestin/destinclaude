---
name: Landing Page
version: 1.0
last_updated: 2026-03-16
---

# Landing Page Spec

A single-page site that non-technical friends can open from a text message, understand what the toolkit does, and install it — without ever seeing GitHub.

**Live URL:** https://itsdestin.github.io/claudifest-destiny/
**Source:** `docs/index.html` (served via GitHub Pages from `master` branch, `/docs` path)

## Architecture

Single self-contained `docs/index.html`. CSS inline, fonts loaded from Google Fonts (JetBrains Mono + DM Sans). Minimal JS for tab toggle, expandable hints, and copy-to-clipboard. No frameworks, no build step, no dependencies. `.nojekyll` file in `docs/` prevents Jekyll from processing markdown files alongside the HTML.

## Page Sections

### 1. Hero
- "Open Source Toolkit" badge
- Project name (ClaudifestDestiny) with gradient text
- Tagline: "A modular toolkit that transforms Claude Code into a personal knowledge system, journal, task manager, and more."
- Personal warmth line: "Built for my friends. Shared with everyone."
- Inline link: "New to Claude Code? Start here" → beginner's guide

### 2. What's Inside
Four cards in a 2x2 grid (stacks to 1-column on mobile), one per layer:
- **Core** (diamond icon) — Foundation hooks, specs, memory, commands
- **Life** (star icon) — Journaling, encyclopedia, Google Drive sync
- **Productivity** (lightning icon) — Inbox processing, Todoist, text messaging
- **Modules** (cross-diamond icon) — Domain-specific optional add-ons

Icons are Unicode characters in teal badge containers. Below: dependency note with inline "Want the technical details?" link → system architecture.

### 3. Install
- Tab toggle between Mac/Linux and Windows (ARIA tab roles)
- Mac/Linux: `curl -fsSL https://raw.githubusercontent.com/itsdestin/claudifest-destiny/master/bootstrap/install.sh | bash`
- Windows: `powershell -ExecutionPolicy Bypass -c "iwr -useb https://raw.githubusercontent.com/itsdestin/claudifest-destiny/master/bootstrap/install.ps1 -OutFile install.ps1; .\install.ps1"`
- Copy button on each command block
- "Then open Claude Code in your terminal and say **set me up**"
- Expandable hints (collapsed by default): "What's a terminal?" and "What's PowerShell?"

### 4. Documentation
2x2 grid of linked cards with hover arrow reveal:
| Card | Links To | Description |
|------|----------|-------------|
| Quickstart | GitHub blob: `docs/quickstart.md` | Already use Claude Code? Four steps and you're done. |
| Beginner's Guide | GitHub blob: `docs/for-beginners/00-what-is-claude.md` | Never used Claude Code? Start from the very beginning. |
| System Architecture | GitHub blob: `docs/system-architecture.md` | Technical deep dive into layers, hooks, specs, and data flow. |
| Specs Index | GitHub blob: `core/specs/INDEX.md` | Feature documentation and design decisions. |

### 5. Footer
- "Built by Destin" (links to GitHub profile)
- GitHub repo link + "MIT License"

## Visual Design

- **Background:** Deep navy (`#080c14`) with subtle radial gradient glows (teal top-left, purple bottom-right)
- **Surface colors:** Cards at `#111927`, hover at `#162032`
- **Text:** Primary `#e2e8f0`, secondary `#8b9dc3`, dim `#4a5e80`
- **Accent:** Sky blue `#38bdf8` for links, borders, highlights, icon badges
- **Typography:** DM Sans for prose (400/500/600/700), JetBrains Mono for code and labels
- **Borders:** Subtle `rgba(139, 157, 195, 0.12)`, accent borders `rgba(56, 189, 248, 0.25)`
- **Animations:** Staggered fade-up on page load (hero elements)
- **Responsive:** Breakpoint at 768px — grids collapse to single column, hints stack vertically

## Hosting Configuration

- GitHub Pages source: `master` branch, `/docs` path
- `.nojekyll` file prevents Jekyll processing
- `gh-pages` branch exists (created during setup) but is not the active source
- No custom domain configured (uses `itsdestin.github.io/claudifest-destiny/`)
