---
name: Landing Page
version: 1.4
last_updated: 2026-03-18
---

# Landing Page Spec

A single-page site that non-technical friends can open from a text message, understand what the toolkit does, and install it — without ever seeing GitHub.

**Live URL:** https://itsdestin.github.io/destinclaude/
**Source:** `docs/index.html` (served via GitHub Pages from `master` branch, `/docs` path)

## Architecture

Single self-contained `docs/index.html`. CSS inline, fonts loaded from Google Fonts (JetBrains Mono + DM Sans). Minimal JS for tab toggle, copy-to-clipboard, theme switching, scroll animations, and demo playback. No frameworks, no build step, no dependencies. `.nojekyll` file in `docs/` prevents Jekyll from processing markdown files alongside the HTML.

### Brand Icons

Four SVG icon files in `docs/`, split into two sets:

**Active (outlined paths)** — used everywhere (favicon, nav, footer):
- `favicon-light.svg` — cream background `#f5efe8`, dark D `#2d2418`
- `favicon-dark.svg` — charcoal background `#2a2520`, light D `#f0e8dd`

**Design reference (text-based)** — kept as editable originals, not used in production:
- `icon-light-reference.svg` — same visual, but D and C are `<text>` elements using Cascadia Code
- `icon-dark-reference.svg` — same visual, text-based

**Why outlined paths:** SVG `<text>` elements rely on the browser loading the specified font. Favicons render in an isolated context where page fonts (Cascadia Code, Consolas) are not available — the browser falls back to a default font with different metrics, causing the "DC" letters to shift downward. Converting the letters to `<path>` outlines (traced from Consolas Bold via fontTools) eliminates the font dependency. The outlined versions use the same paths everywhere for consistency, with a subtle same-color stroke (`stroke-width="25"` in font units) for slight extra boldness to compensate for sub-pixel rendering at small sizes. The text-based reference files are retained for future design iteration (easier to edit than raw paths).

**Design:** Terminal-inspired, modeled after the Claude Code input box. Elements (left to right):
- **Chevron** (`>`) — filled polygon with flat horizontal top/bottom cuts (parallel to decorative lines), wide opening angle (~103°), slightly bolder than letter strokes
- **D** — Cascadia Code bold (reference) / Consolas Bold outlines (favicon), color matches page text color per mode
- **C** — same font treatment, always in accent orange (`#e07840` light / `#e8945c` dark)
- **Cursor block** — rectangular block with minimal rounding (`rx="0.5"`), accent orange with reduced opacity

Framing: rounded rect with accent-color border + subtle horizontal accent lines at top and bottom (inside the border). All instances (favicon, nav, footer) use the outlined versions and swap between light/dark on theme toggle.

## Page Sections

### 0. Sticky Navigation
- Fixed top bar (`56px` height) with blur backdrop
- Left: brand icon (swaps light/dark per theme) + "DestinClaude" wordmark
- Right: section links (About, Prerequisites, Install, Features, Docs, FAQ) + dark mode toggle button
- Mobile: hides Prerequisites and Features links

### 1. Hero
- Title box with warm orange tint: "Destin**Claude**" (second word in accent color) + "For Claude Code by Anthropic" subtitle
- Tagline: "Your life, organized by conversation."
- Personal warmth line: "Trust me, I promise it's actually kinda cool."
- Prominent "Get Started" CTA button (orange pill, scrolls to install section)

### 1.5. How It Works
- Three-step visual flow: **Install** → **Chat** → **It just works**
- Each step has an icon in a bordered square, step number, title, and one-line description
- Connected by arrow characters on desktop; stacks with scaled-down layout on mobile

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

### 9. Demo Session
- Section label: "See it in action"
- Heading: "What a session looks like"
- Faux terminal window (title bar with red/yellow/green dots) showing an animated journaling session
- Lines appear sequentially via `data-delay` attributes, triggered by IntersectionObserver on scroll
- Terminal adapts to light/dark mode via CSS variables
- "Replay" button below the terminal

### 10. FAQ
- Section label: "Common questions"
- Accordion-style Q&A (one open at a time):
  - Is my data private?
  - What does the $20/month get me?
  - Can I use this without Google?
  - What if I break something?
  - Do I need to know how to code?
  - Does it work on Mac and Windows?

### 11. Footer
- Brand icon (light/dark) + "DestinClaude" wordmark linking to top
- GitHub link with inline SVG icon, "Built by Destin" link
- Open Source badge + MIT License text
- Floating "back to top" button (appears after scrolling past 400px)

## Visual Design

### Light Mode (default)
- **Background:** Warm cream (`#faf6f1`) with subtle warm radial gradients
- **Surface colors:** Cards white (`#ffffff`), hover `#fef9f4`
- **Text:** Primary `#2d2418`, secondary `#6b5d4f`, dim `#9a8d7f`
- **Accent:** Burnt orange `#e07840` for links, borders, highlights, badges
- **Code blocks:** Warm beige (`var(--bg-surface)`) with dark text

### Dark Mode
- **Background:** Deep brown (`#1a1612`)
- **Surface colors:** Cards `#2a2420`, hover `#332c26`
- **Text:** Primary `#f0e8dd`, secondary `#b8a898`, dim `#7a6e62`
- **Accent:** Warm orange `#e8945c`
- Toggled via button in nav; respects `prefers-color-scheme`; persists in `localStorage` (`dc-theme`)

### Shared
- **Typography:** DM Sans for prose (400/500/600/700), JetBrains Mono for code and labels, Cascadia Code for brand icon
- **Borders:** Subtle `rgba(45, 36, 24, 0.1)`, accent borders `rgba(224, 120, 64, 0.3)`
- **Card glow:** `0 0 40px rgba(224, 120, 64, 0.12)` on all bordered cards
- **Animations:** Hero uses staggered fade-up on load; all other sections use IntersectionObserver scroll-triggered reveal (`.reveal` class)
- **Responsive:** Breakpoint at 768px — all grids collapse to single column
- **Accessibility:** `:focus-visible` outlines (not blanket `outline: none`); integration tags are `<button>` elements with `tabindex`; tab panels have `aria-controls`/`aria-labelledby`

### OS Detection
- Install tab auto-selects macOS by default; switches to Windows only if `navigator.userAgent` matches `/Win/i`

## Hosting Configuration

- GitHub Pages source: `master` branch, `/docs` path
- `.nojekyll` file prevents Jekyll processing
- `gh-pages` branch exists but is not the active source
- No custom domain configured (uses `itsdestin.github.io/destinclaude/`)

## Planned Updates

- **Self-host integration icons** — Bundle integration tag icons as local SVGs instead of loading from Wikipedia/SimpleIcons CDN (#12 from mockup)
- **OG image** — Create and host `og-image.png` for social sharing previews
- **Promote mockup to live** — Replace `index.html` with `index-mockup.html` once all changes are reviewed

## Changelog

- **v1.4 (2026-03-18):** Major landing page redesign (mockup in `docs/index-mockup.html`). Added: sticky navigation bar with section links; dark mode toggle (CSS variables, `prefers-color-scheme`, `localStorage`); brand icons — terminal-inspired `> DC` motif with flat-cut chevron, Cascadia Code font, accent cursor block, split into text-based reference icons (`icon-*-reference.svg`) for nav/footer and traced-outline favicons (`favicon-*.svg`) with Consolas Bold glyph paths for font-independent rendering at small sizes; "How It Works" 3-step flow (Install → Chat → It just works); hero tagline + CTA button; animated demo terminal section showing a journaling session; FAQ accordion (6 questions); polished footer with icon, GitHub SVG, back-to-top button; scroll-triggered animations via IntersectionObserver; OS auto-detection for install tabs (defaults to macOS); accessibility fixes (`:focus-visible`, `<button>` integration tags, ARIA attributes); Open Graph + Twitter Card meta tags; adaptive demo terminal (light/dark mode). Live site `index.html` favicon updated from inline diamond to `favicon-light.svg`. Spec updated with Brand Icons subsection (including favicon font-rendering challenge), new sections 0 (Nav), 1.5 (How It Works), 9 (Demo), 10 (FAQ), 11 (Footer). Visual Design split into Light/Dark/Shared subsections.
- **v1.3 (2026-03-18):** Documented implemented Integrations section (18 services with icons, expandable descriptions, "More coming soon" pill). Updated hero title from "Claudifest Destin-y" to "DestinClaude". Updated prerequisites: GitHub changed to Required, Google changed to "Google or Apple", added PAID/FREE badges, name-first card layout with right-aligned links. Added section numbering for Integrations (new section 7), renumbered Documentation to 8 and Footer to 9.
- **v1.2 (2026-03-17):** Added Planned Updates section with integrations icons feature request (from inbox 2026-03-17).
- **v1.1 (2026-03-17):** Updated to reflect warm cream/orange color scheme, added sections 2 (What Is This?), 3 (Before You Begin), 5 (Step 2: Talk to Claude). Removed tagline from hero, added title box with subtitle. Updated all color values.
- **v1.0 (2026-03-16):** Initial spec — dark navy/teal theme.
