---
name: theme-builder
description: Build immersive DestinCode theme packs. Invoke as /theme-builder "your vibe description". Two-phase — concept browser first, then full theme pack generation with assets.
---

# /theme-builder

Build a custom DestinCode theme pack. Claude generates concept options in a browser window first — no app changes — then builds a complete theme pack (folder with manifest + assets). The app hot-reloads from the folder.

---

## Phase 1 — Concept Browser

### Step 1: Start the Visual Companion Server

```bash
bash "core/skills/theme-builder/scripts/start-server.sh" --project-dir ~/.claude/destinclaude-themes
```

Use `run_in_background: true`. Then read the `server-info` file after 3 seconds.

### Step 2: Read the Preview CSS

```
core/skills/theme-builder/theme-preview.css
```

This CSS replicates the app's exact rendering. You MUST embed it in every HTML file you write.

### Step 3: Determine Prompt Mode

Analyze the user's prompt and determine the mode **automatically** — never ask:

**Brand/IP Mode** — The prompt references a recognizable character, brand, franchise, or product (e.g. "Hello Kitty", "Star Wars", "Minecraft", "Studio Ghibli", "Cybertruck", "Nike").
- Research-first: web search for authentic imagery, official color palettes, recognizable iconography
- Source real wallpapers, character art, official patterns via web search
- Brand fidelity is paramount: Kitty's actual bow shape, not a generic ribbon

**Vibe/Abstract Mode** — The prompt describes an aesthetic, mood, setting, or abstract concept (e.g. "cozy autumn", "deep ocean", "cyberpunk hacker", "cottagecore", "lo-fi study", "volcanic").
- Creative-first: Claude designs original visual identities
- Claude generates all SVGs, picks complementary wallpapers from stock/Unsplash
- Freedom to invent color stories, effects, and atmospheric touches

### Step 4: Generate 3 Theme Concepts (Round 1)

Generate **3 genuinely different interpretations** of the prompt. Not 3 slight variations — 3 different creative takes. For each concept, decide:

- A palette (all 15 tokens — see Token Design Rules)
- Shape radius values (including `--radius` for bare rounding and `--radius-toggle` for nested toggles)
- A font choice — pick a Google Font or system font that reinforces the theme vibe. Set `--font-sans` and `--font-mono`. Examples: `'Victor Mono'` for cyberpunk, `'Comic Neue'` for playful, `'IBM Plex Mono'` for corporate, `'Fira Code'` for hacker, `'Merriweather'` for literary. Include `@import url(...)` for the Google Font in the concept card `<head>`.
- Background type (solid, gradient, or image)
- Layout presets (input-style, bubble-style, header-style, statusbar-style)
- Effects (particles, custom particle shapes, scan-lines, vignette, noise)
- Pattern overlay (what repeating pattern Claude will generate)
- Icon overrides (what themed icons Claude will generate)
- Mascot crossover (what accessories/modifications to add to the base mascot)
- Custom CSS effects (::selection colors, scrollbar art, glows, animated gradients)

Render them as concept cards by writing an HTML file to `screen_dir`. Follow the **Concept Card Rendering Spec** below exactly.

### Step 5: Tell the User

Tell the user the URL and ask them to look while iterating in chat.

### Step 5b: Quick-Apply Live Preview (Optional)

When the user selects a concept, you can optionally let them preview it live in the app by writing a minimal manifest to the reserved `_preview` slug:

```bash
mkdir -p ~/.claude/destinclaude-themes/_preview
```

Then write a `manifest.json` with **only** tokens, shape, layout, effects, and font — no asset references (no wallpaper, pattern, particle-shape, icons, mascot, cursor, or scrollbar paths). The app auto-switches to `_preview` when it detects the file, and auto-reverts when the file is deleted.

```json
{
  "name": "Preview",
  "slug": "_preview",
  "dark": true,
  "tokens": { "canvas": "#...", ... },
  "shape": { "radius-sm": "..." },
  "layout": { "input-style": "floating" },
  "effects": { "vignette": 0.2, "scan-lines": true },
  "font": { "family": "'Victor Mono', monospace", "google-font-url": "..." }
}
```

**Rules:**
- Never include asset paths in the preview manifest — they haven't been created yet and will 404
- Effects that require assets (custom particles, patterns) should be omitted from the preview
- The user can see colors, fonts, shape, layout, and screen-wide effects (vignette, noise, scan-lines) live
- When done previewing, delete the `_preview` folder to revert: `rm -rf ~/.claude/destinclaude-themes/_preview`
- Do NOT use quick-apply unless the user asks to see it live, or after Round 2 when they're deciding between final options

### Step 6: Two-Round Minimum (Mandatory)

After the user picks a concept ("I like option 2", "go with Midnight Rain"), you MUST generate **3 refined variations** of that concept automatically — even if the user doesn't ask for another round. Explain: "Here are 3 refined takes on [name]. Pick your favorite, or tell me what to change."

**Round 2 variations are always:**
1. **Polished** — the chosen concept fully dialed in, final colors, all effects refined
2. **Dialed Up** — bolder, more atmospheric, more immersive, more effects
3. **Dialed Down** — subtler, daily-driver friendly, fewer effects, less visual intensity

Only proceed to Phase 2 after the user confirms from the second (or later) round.

**Iteration loop:** User requests changes -> re-render in the browser. They can request unlimited additional rounds. Proceed to Phase 2 when the user says "build it", "apply it", "go", or similar.

---

### Concept Card Rendering Spec

Every concept card MUST render an **app mockup** that uses the exact same CSS classes and token system as the real app. This is how users evaluate what their theme will actually look like.

**HTML structure for each concept card:**

```html
<!-- Set tokens as CSS custom properties on a scoping div -->
<div class="concept-card" style="
  --canvas: #HEX; --panel: #HEX; --inset: #HEX; --well: #HEX;
  --accent: #HEX; --on-accent: #HEX;
  --fg: #HEX; --fg-2: #HEX; --fg-dim: #HEX;
  --fg-muted: #HEX; --fg-faint: #HEX;
  --edge: #HEX; --edge-dim: #HEX80;
  --scrollbar-thumb: #HEX; --scrollbar-hover: #HEX;
  --radius: Npx; --radius-sm: Npx; --radius-md: Npx; --radius-lg: Npx; --radius-xl: Npx; --radius-2xl: Npx; --radius-full: 9999px;
  --radius-toggle: calc(var(--radius-md) - 2px);
  --font-sans: 'CHOSEN FONT', 'Cascadia Mono', monospace; --font-mono: 'CHOSEN FONT', 'Cascadia Mono', monospace;
">
  <!-- Theme name + vibe -->
  <h2 class="text-fg" style="font-size:16px; font-weight:700;">Theme Name</h2>
  <p class="text-fg-muted" style="font-size:11px;">One-sentence vibe description</p>

  <!-- Color palette strip -->
  <div class="swatch-row">
    <div class="swatch" style="background: var(--canvas);" title="canvas"></div>
    <div class="swatch" style="background: var(--panel);" title="panel"></div>
    <div class="swatch" style="background: var(--inset);" title="inset"></div>
    <div class="swatch" style="background: var(--accent);" title="accent"></div>
    <div class="swatch" style="background: var(--fg);" title="fg"></div>
  </div>

  <!-- Asset preview row — shows what Claude plans to create/download -->
  <div class="asset-preview-row">
    <div class="asset-preview-item">
      <div class="asset-preview-thumb" style="background: url('...') center/cover; /* or gradient/pattern preview */"></div>
      <span class="asset-preview-label">Wallpaper</span>
    </div>
    <div class="asset-preview-item">
      <div class="asset-preview-thumb asset-preview-pattern" style="background-image: url('data:image/svg+xml,...'); background-size: 20px 20px;"></div>
      <span class="asset-preview-label">Pattern</span>
    </div>
    <div class="asset-preview-item">
      <div class="asset-preview-thumb" style="/* inline svg preview of particle shape */"></div>
      <span class="asset-preview-label">Particles</span>
    </div>
    <div class="asset-preview-item">
      <div class="asset-preview-thumb" style="/* inline svg preview of mascot crossover */"></div>
      <span class="asset-preview-label">Mascot</span>
    </div>
  </div>

  <!-- Vibe tags -->
  <div class="concept-label">
    <span>floating input</span>
    <span>custom particles</span>
    <span>glassmorphism</span>
    <span>animated gradient</span>
  </div>

  <!-- App mockup — this is what the user is really evaluating -->
  <div class="app-mockup"
       data-chrome-style="default"
       data-input-style="floating"
       data-bubble-style="default"
       data-header-style="default"
       data-statusbar-style="default">

    <!-- Background layer (for gradient/image themes) -->
    <div id="theme-bg" style="background: linear-gradient(...); opacity: 0.8;"></div>

    <!-- Pattern overlay layer (for pattern themes) -->
    <div class="pattern-overlay" style="background-image: url('data:image/svg+xml,...'); opacity: 0.06;"></div>

    <!-- If glassmorphism: set data-panels-blur on this div -->
    <div class="header-bar bg-panel">
      <span style="font-size:14px;">&#9679;</span>
      DestinCode
      <div class="header-toggle">
        <span class="toggle-btn active">Chat</span>
        <span class="toggle-btn">Term</span>
      </div>
    </div>

    <div class="chat-area">
      <div class="chat-bubble assistant">
        Hello! How can I help you today?
        <div class="tool-card">Read file.ts</div>
      </div>
      <div class="chat-bubble user">
        Can you explain how this works?
      </div>
      <div class="chat-bubble assistant">
        Sure! Let me walk you through it.
      </div>
    </div>

    <div class="chips-row bg-canvas">
      <div class="chip">Journal</div>
      <div class="chip">Git Status</div>
      <div class="chip">Review PR</div>
    </div>

    <div class="input-bar-container bg-panel">
      <div class="input-form">
        <span class="attach-btn">&#8853;</span>
        <div class="input-field">Message Claude...</div>
        <div class="send-btn">&#8594;</div>
      </div>
    </div>

    <div class="status-bar bg-panel">
      <span>Theme Name</span>
      <span class="text-fg-faint">Opus 4.6</span>
    </div>

    <!-- Particle indicator (static badge — animation is app-only) -->
    <div class="particle-indicator">custom hearts</div>
  </div>
</div>
```

### Critical Rendering Rules

1. **All colors come from CSS custom properties** — never hardcode hex values in element styles except on the scoping `style="--canvas: ..."` attribute.
2. **Use the exact CSS classes** from `theme-preview.css`: `.bg-panel`, `.bg-canvas`, `.text-fg`, `.border-edge`, `.chat-bubble.user`, `.chat-bubble.assistant`, etc.
3. **Layout presets are data attributes** on `.app-mockup`: `data-chrome-style`, `data-input-style`, `data-bubble-style`, `data-header-style`, `data-statusbar-style`. The CSS handles the visual changes.
4. **Glassmorphism** requires BOTH:
   - `data-panels-blur` attribute on `.app-mockup` (or a wrapper)
   - `style="--panels-blur: Npx; --panel-glass: rgba(R,G,B,OPACITY);"` on the same element
   - Compute `--panel-glass` from the panel hex color + `panels-opacity` value
5. **Background layer**: Set `#theme-bg` inside `.app-mockup` with the exact `background` and `opacity` from the concept's background config. For solid backgrounds, omit the `#theme-bg` div entirely. Note: at runtime the app sets `background-image` directly on `<body>` (not via a z-index div), so wallpaper themes need the glassmorphism `custom_css` block to make `.app-shell` transparent.
6. **Pattern overlay**: Use `.pattern-overlay` inside `.app-mockup` with a data-URI SVG `background-image` and `background-size` to show repeating patterns. Set opacity via the `opacity` style property. Use data-URI inline SVGs so the pattern is visible in the preview without external files.
7. **Asset preview row**: Show thumbnails for planned assets. For wallpapers in brand mode, show the image you plan to download. For generated SVGs, show a tiny inline data-URI preview. For items that will be generated later, use a colored placeholder with an icon label.
8. **Particles are label-only** in the preview. Show a `.particle-indicator` badge with the preset name (e.g. "rain", "custom hearts", "brand stars"). Omit it for `"none"`.
9. **Embed the full `theme-preview.css` contents** in a `<style>` tag in the HTML `<head>`. Do NOT link to an external file.
10. **Page layout**: show concept cards in a responsive grid (1-3 columns). The page background should be `#1a1a1a` (neutral dark) so all themes are evaluated against the same backdrop.
11. **Pill bubble style**: `data-bubble-style="pill"` uses `radius-2xl` (NOT `radius-full`) to create a "very rounded" look without destructive semicircular caps. It works with all content types including tool cards. The padding is 24px horizontal / 16px vertical.
12. **Font selection**: Every theme MUST include a font choice via `--font-sans` and `--font-mono` in its CSS variables. Pick a font that reinforces the theme's vibe — e.g. a rounded sans-serif for playful themes, a strict monospace for hacker themes, a serif for literary themes. Use Google Fonts (web-safe) or well-known system fonts. The concept card scoping div must set both `--font-sans` and `--font-mono` so the mockup renders in the theme's chosen font. If using a Google Font, add `<link href="https://fonts.googleapis.com/css2?family=FONTNAME:wght@400;600;700&display=swap" rel="stylesheet">` in the HTML `<head>` so the font renders in the concept browser. The manifest stores this as `font.family`.
13. **Visual effects overlays**: For themes with vignette, noise, or scan-lines, add overlay divs inside `.app-mockup` (after the pattern-overlay, before panels):
    - Vignette: `<div class="effect-vignette" style="--vignette-opacity: 0.2;"></div>`
    - Noise: `<div class="effect-noise" style="--noise-opacity: 0.04;"></div>`
    - Scan-lines: `<div class="effect-scanlines" style="--scanline-opacity: 0.08;"></div>`
    These are cosmetic overlays — only include them when the theme concept uses these effects.
14. **Layout presets work in the app.** `data-chrome-style`, `data-input-style`, `data-bubble-style`, `data-header-style`, and `data-statusbar-style` are wired to the real app's DOM via the theme engine. `chrome-style: "floating"` elevates all chrome bars (header, input, status) into detached rounded cards; individual `*-style` keys override per element. Input style presets require the `input-bar-container` class on the input wrapper. **The bottom chrome order is: status bar → input bar** (status sits directly above the input area).
15. **No absolute positioning on layout-flow elements**: Never use `position: absolute` on `.status-bar`, `.input-bar-container`, or other elements that participate in the app's flex column layout. Absolute positioning removes them from document flow and causes overlaps with adjacent elements. The floating chrome aesthetic uses `align-self`, `width: fit-content`, `margin`, `border-radius`, and `box-shadow` instead.
16. **Static asset serving**: The visual companion server only serves non-HTML files under the `/files/` URL prefix (e.g. `GET /files/wallpaper.jpg`). A bare reference like `src="wallpaper.jpg"` resolves to `GET /wallpaper.jpg`, which returns 404. All `<img>`, `background-image: url(...)`, and other asset references in preview HTML **MUST** use the `/files/` prefix (e.g. `src="/files/wallpaper.jpg"`, `url('/files/wallpaper.jpg')`). Additionally, the asset file must exist inside the server's `screen_dir` (the `content/` directory) — files in the theme pack folder (`<slug>/assets/`) are in a different directory tree and are not accessible to the server. Always copy downloaded wallpapers and any other binary assets into `screen_dir` immediately after downloading them, then reference them as `/files/<filename>` in all HTML.

---

## Phase 2 — Theme Pack Generation

**When the user picks a concept from the second (or later) round and says "build it":**

### Phase 2a: Visual Refinement (before writing the theme pack)

After the user approves a concept direction, Claude generates and shows each visual element one at a time in the concept browser for tweaking. Each screen is a separate HTML file pushed to the visual companion's `screen_dir`. Claude iterates on each screen until the user approves or says "skip" / "looks good" / "next", then moves to the next screen. After all screens are approved, proceed to the full theme pack generation in Step 1 below.

**IMPORTANT — Wallpaper in previews**: If the theme uses a wallpaper image (not just a CSS gradient), download it **before** rendering Screen 1. Save it to both `<slug>/assets/wallpaper.<ext>` AND copy it into `screen_dir` so the preview server can serve it. Reference it in HTML as `/files/wallpaper.<ext>` (see Critical Rendering Rule 16). Concept card mockups in Phase 1 should also use the real wallpaper in `#theme-bg` instead of a CSS gradient stand-in — otherwise the user evaluates glassmorphism themes without seeing how the wallpaper actually looks through frosted panels, which defeats the purpose.

**Screen 1: Background & Atmosphere**
- Show the wallpaper or gradient Claude plans to use as a full-width preview (filling most of the viewport)
- Show the pattern overlay if applicable, rendered as a tiled preview panel beside or below the wallpaper
- Show glassmorphism settings: a panel sample with the planned blur level and panel opacity, overlaid on the wallpaper so the user sees the actual frosted-glass effect
- Show the particle effect choice as a label badge (particles are static in preview)
- Use concept card CSS classes for panels/surfaces; use custom layout for the large wallpaper preview area
- All wallpaper references must use `/files/wallpaper.<ext>` (not bare filenames or relative paths — see Critical Rendering Rule 16)
- User can say "try a different wallpaper", "less blur", "no pattern", "more opacity", etc.

**Screen 2: Mascot Crossovers**
- Show all 3 mascot variants (idle, welcome, inquisitive) side by side
- Render each at 120x120px minimum so accessory details are clearly visible
- Display on a neutral background with the theme's accent color as a subtle border or backdrop
- Below each mascot, show its variant label (Idle, Welcome, Inquisitive)
- User can say "add a bigger bow", "make it more subtle", "try without the accessory", "different hat", etc.

**Screen 3: Icons & Details**
- Show icon overrides (send button, new-chat, etc.) at 48x48px scale so details are clear
- Show the custom cursor SVG at 64x64px if applicable
- Show scrollbar styling as a mock scrollbar strip
- Show the `::selection` color as a sample text block with a highlighted selection
- Use the theme's token colors as the page background so icons are seen in context
- User can say "change the send icon", "make the cursor simpler", "different selection color", etc.

Each screen uses the same `<style>` embed pattern (full `theme-preview.css` in `<head>`) and scopes tokens via inline `style="--canvas: ...; --accent: ...;"` on a wrapper div, just like concept cards. The layout within each screen can use custom flexbox/grid arrangements for the larger preview areas.

### Step 1: Create the Theme Pack Folder

```
~/.claude/destinclaude-themes/<slug>/
  manifest.json
  assets/
    wallpaper.png       (or .jpg/.webp)
    pattern.svg
    heart.svg           (particle shape, if custom)
    icon-send.svg       (icon override, if applicable)
    mascot-idle.svg
    mascot-welcome.svg
    mascot-inquisitive.svg
    cursor.svg          (optional)
    scrollbar-thumb.svg (optional)
```

Create the folder structure:
```bash
mkdir -p ~/.claude/destinclaude-themes/<slug>/assets
```

### Step 2: Download the Hero Wallpaper

**Brand/IP Mode:**
- Use WebSearch to find high-quality official or fan art wallpapers
- Use WebFetch to download the image
- Save to `<slug>/assets/wallpaper.png` (or appropriate extension)
- **Also copy to `screen_dir`** so the preview server can serve it (see Critical Rendering Rule 16)
- Prefer 1920x1080 or higher resolution
- Prioritize images that work well as a subtle background (not too busy, good as a blurred backdrop)

**Vibe/Abstract Mode:**
- Use WebSearch to find atmospheric stock photos (Unsplash, Pexels, etc.)
- Use WebFetch to download the image
- Alternatively, use a CSS gradient in `background.value` if no wallpaper is needed
- Save to `<slug>/assets/wallpaper.png`
- **Also copy to `screen_dir`** if a wallpaper image was downloaded (see Critical Rendering Rule 16)

### Step 3: Generate SVG Assets

Write each SVG file to the assets folder using the Write tool. All SVGs should:
- Use a reasonable viewBox (e.g. `0 0 24 24` for icons, `0 0 100 100` for patterns)
- Use `currentColor` or explicit hex fills appropriate to the theme
- Be clean, minimal, and well-optimized (no unnecessary groups or transforms)

**Pattern SVG** (`assets/pattern.svg`):
- A single tile of a repeating pattern
- Should tile seamlessly when used as `background-image` with `background-repeat: repeat`
- ViewBox should define one tile (e.g. `0 0 40 40`)
- Use a single fill color (the app will control opacity via `pattern-opacity`)
- Brand mode: simplified/traced brand iconography (e.g. bow shapes for Hello Kitty, pixel grid for Minecraft)
- Vibe mode: geometric or organic patterns that match the aesthetic

**Particle Shape SVG** (`assets/heart.svg` or similar):
- A single shape, centered in its viewBox
- Used as the particle rendered on the canvas
- Keep it simple — it renders at 8-16px
- Examples: heart, star, snowflake, leaf, lightning bolt, pixel, paw print

**Icon Override SVGs** (`assets/icon-send.svg`, etc.):
- Match the icon slot dimensions (24x24 viewBox)
- Use `currentColor` for the stroke/fill so the icon inherits theme colors
- Supported slots: `send`, `new-chat`, `settings`, `theme-cycle`, `close`, `menu`
- Only override icons where a themed version genuinely improves the experience

**Cursor SVG** (`assets/cursor.svg`, optional):
- 32x32 viewBox, hotspot at top-left
- Only include if it genuinely fits the theme (e.g. a wand for a magical theme, a pickaxe for Minecraft)

**Scrollbar Thumb SVG** (`assets/scrollbar-thumb.svg`, optional):
- Vertical orientation, meant to be used as a `background-image` on the scrollbar thumb
- Subtle — the scrollbar should not be distracting

### Step 4: Generate Mascot Crossovers

The DestinCode mascot has 3 variants. You MUST modify the base SVG templates below to create themed crossover versions. The key constraint: **preserve the core silhouette** (squat body, nub arms, stubby legs, cutout eyes) while adding thematic accessories, proportional tweaks, and themed details. The character must be recognizably the same mascot in a crossover costume, not a completely different character.

**What you can do:**
- Add accessories ON TOP of the body (hats, bows, capes, horns, crowns, headphones)
- Add held items extending from the arms (swords, wands, flowers, tools)
- Change the eye style within the cutouts (add pupils, sparkles, change shapes)
- Add surface details to the body (patterns, textures, stripes, spots)
- Add a tail, wings, or other appendages
- Modify arm/leg shapes slightly (make blockier for Minecraft, rounder for Kirby)
- Add themed elements around the character (sparkles, flames, leaves, snow)

**What you must NOT do:**
- Change the basic body proportions (it's a squat rounded rectangle)
- Remove the eye cutouts entirely
- Make it unrecognizably different from the original mascot
- Use raster images inside the SVG

#### Base Template: AppIcon (idle — >< squinting eyes)

```svg
<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <!-- Body with eye cutouts -->
  <path
    fillRule="evenodd"
    d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M8.5 8 L10.5 10 L8.5 12 L9.5 12 L11.5 10 L9.5 8 Z M15.5 8 L13.5 10 L15.5 12 L14.5 12 L12.5 10 L14.5 8 Z"
  />
  <!-- Left arm -->
  <path d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z" />
  <!-- Right arm -->
  <path d="M20.8 9 L22.2 9 A0.8 0.8 0 0 1 23 9.8 L23 12.2 A0.8 0.8 0 0 1 22.2 13 L20.8 13 A0.8 0.8 0 0 1 20 12.2 L20 9.8 A0.8 0.8 0 0 1 20.8 9 Z" />
  <!-- Left leg -->
  <rect x="7.2" y="17" width="3.5" height="4" rx="1.2" />
  <!-- Right leg -->
  <rect x="13.3" y="17" width="3.5" height="4" rx="1.2" />
</svg>
```

#### Base Template: WelcomeAppIcon (welcome — sparkle eyes, tilted smile, waving)

```svg
<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="eye-swirl-a" cx="25%" cy="30%" r="60%">
      <stop offset="0%" stopColor="#2a3040" stopOpacity="1" />
      <stop offset="100%" stopColor="#2a3040" stopOpacity="0" />
    </radialGradient>
    <radialGradient id="eye-swirl-b" cx="70%" cy="65%" r="55%">
      <stop offset="0%" stopColor="#2a2535" stopOpacity="1" />
      <stop offset="100%" stopColor="#2a2535" stopOpacity="0" />
    </radialGradient>
  </defs>
  <!-- Eye backgrounds -->
  <ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="#1e2636" />
  <ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="url(#eye-swirl-a)" />
  <ellipse cx="9.3" cy="9.55" rx="1.6" ry="2.2" fill="url(#eye-swirl-b)" />
  <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="#1e2636" />
  <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="url(#eye-swirl-a)" />
  <ellipse cx="14.7" cy="9.25" rx="1.6" ry="2.2" fill="url(#eye-swirl-b)" />
  <!-- Body with eye cutouts -->
  <path
    fillRule="evenodd"
    d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M9.3 7.35 A1.6 2.2 0 1 0 9.3 11.75 A1.6 2.2 0 1 0 9.3 7.35 Z M14.7 7.05 A1.6 2.2 0 1 0 14.7 11.45 A1.6 2.2 0 1 0 14.7 7.05 Z"
  />
  <!-- Eye sparkles -->
  <circle cx="10" cy="10.25" r="0.25" />
  <circle cx="9.4" cy="10.85" r="0.18" />
  <circle cx="10.3" cy="10.85" r="0.13" />
  <circle cx="15.4" cy="9.95" r="0.25" />
  <circle cx="14.8" cy="10.55" r="0.18" />
  <circle cx="15.7" cy="10.55" r="0.13" />
  <!-- Tilted smile -->
  <g transform="rotate(-2 12 13.3)"><path d="M10.8 13.3 Q10.8 13 12 13 Q13.2 13 13.2 13.3 A1.1 1 0 0 1 10.8 13.3 Z" fill="#222030" /></g>
  <!-- Left arm (lowered) -->
  <g transform="translate(0.3 1.0) rotate(-10 2.5 11)"><path d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z" /></g>
  <!-- Right arm (waving) -->
  <g transform="translate(-0.1 0.8) rotate(-20 19.5 6)"><path d="M20.8 2.5 L22.2 2.5 A0.8 0.8 0 0 1 23 3.3 L23 5.7 A0.8 0.8 0 0 1 22.2 6.5 L20.8 6.5 A0.8 0.8 0 0 1 20 5.7 L20 3.3 A0.8 0.8 0 0 1 20.8 2.5 Z" /></g>
  <!-- Legs -->
  <rect x="7.2" y="17" width="3.5" height="4" rx="1.2" />
  <rect x="13.3" y="17" width="3.5" height="4" rx="1.2" />
</svg>
```

#### Base Template: InquisitiveAppIcon (inquisitive — wide round eyes with pupils)

```svg
<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <!-- Body with round eye cutouts -->
  <path
    fillRule="evenodd"
    d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M9.8 8.2 A2 2 0 1 0 9.8 12.2 A2 2 0 1 0 9.8 8.2 Z M14.2 8.2 A2 2 0 1 0 14.2 12.2 A2 2 0 1 0 14.2 8.2 Z"
  />
  <!-- Pupils -->
  <circle cx="10.3" cy="10.2" r="0.7" />
  <circle cx="14.7" cy="10.2" r="0.7" />
  <!-- Left arm -->
  <path d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z" />
  <!-- Right arm -->
  <path d="M20.8 9 L22.2 9 A0.8 0.8 0 0 1 23 9.8 L23 12.2 A0.8 0.8 0 0 1 22.2 13 L20.8 13 A0.8 0.8 0 0 1 20 12.2 L20 9.8 A0.8 0.8 0 0 1 20.8 9 Z" />
  <!-- Left leg -->
  <rect x="7.2" y="17" width="3.5" height="4" rx="1.2" />
  <!-- Right leg -->
  <rect x="13.3" y="17" width="3.5" height="4" rx="1.2" />
</svg>
```

#### Mascot Crossover Examples

- **Hello Kitty:** Add a red bow on top of the head, whisker marks on cheeks, keep the >< eyes. Fill body with white, add pink nose dot.
- **Star Wars (Jedi):** Add a hooded cloak draped over body, lightsaber extending from right arm (glowing blade). Keep eyes as-is but add Jedi robe texture.
- **Minecraft:** Make the body more rectangular (reduce border-radius), add a pickaxe extending from arm, pixelate the eye cutouts into blocky shapes. Use earth-tone fills.
- **Cyberpunk:** Add glowing neon circuit lines on body, LED strips on arms, visor over eyes. Use neon pink/cyan fills.
- **Cottagecore:** Add a flower crown on head, tiny apron on body, basket in one hand. Soft earthy fills.

Write all 3 mascot variants (`mascot-idle.svg`, `mascot-welcome.svg`, `mascot-inquisitive.svg`) to `<slug>/assets/`. Use the base templates above as your starting point and add themed modifications. Ensure each variant maintains its distinctive expression (idle = ><, welcome = sparkle eyes + wave, inquisitive = round eyes with pupils).

### Step 5: Write the Manifest

Write `<slug>/manifest.json` matching this schema exactly:

```jsonc
{
  "name": "Display Name Here",
  "slug": "kebab-case-slug",
  "dark": true,
  "author": "claude",
  "created": "YYYY-MM-DD",

  "tokens": {
    "canvas": "#hex",
    "panel": "#hex",
    "inset": "#hex",
    "well": "#hex",
    "accent": "#hex",
    "on-accent": "#hex",
    "fg": "#hex",
    "fg-2": "#hex",
    "fg-dim": "#hex",
    "fg-muted": "#hex",
    "fg-faint": "#hex",
    "edge": "#hex",
    "edge-dim": "#hex80",
    "scrollbar-thumb": "#hex",
    "scrollbar-hover": "#hex"
  },

  "shape": {
    "radius": "Npx",
    "radius-sm": "Npx",
    "radius-md": "Npx",
    "radius-lg": "Npx",
    "radius-full": "9999px"
  },

  "font": {
    "family": "'Font Name', 'Cascadia Mono', monospace",
    "google-font-url": "https://fonts.googleapis.com/css2?family=Font+Name:wght@400;600;700&display=swap"
  },

  "background": {
    "type": "solid | gradient | image",
    "value": "color, gradient, or relative path (assets/wallpaper.png)",
    "opacity": 1,
    "panels-blur": 0,
    "panels-opacity": 1.0,
    "pattern": "assets/pattern.svg",
    "pattern-opacity": 0.06
  },

  "layout": {
    "chrome-style": "default | floating",
    "input-style": "default | floating | minimal | terminal",
    "bubble-style": "default | pill | flat | bordered",
    "header-style": "default | minimal | hidden",
    "statusbar-style": "default | minimal"
  },

  "effects": {
    "particles": "none | rain | dust | ember | snow | custom",
    "particle-shape": "assets/heart.svg",
    "particle-count": 40,
    "particle-speed": 1.0,
    "particle-drift": 0.5,
    "particle-size-range": [8, 16],
    "scan-lines": false,
    "vignette": 0,
    "noise": 0
  },

  "icons": {
    "send": "assets/icon-send.svg"
  },

  "mascot": {
    "idle": "assets/mascot-idle.svg",
    "welcome": "assets/mascot-welcome.svg",
    "inquisitive": "assets/mascot-inquisitive.svg"
  },

  "cursor": "assets/cursor.svg",

  "scrollbar": {
    "thumb-image": "assets/scrollbar-thumb.svg",
    "track-color": "transparent"
  },

  "custom_css": "::selection { background: rgba(R,G,B,0.3); }"
}
```

**Schema notes:**
- All asset paths are **relative** to the theme folder (e.g. `assets/wallpaper.png`, not absolute paths)
- Omit optional fields rather than including them with null/empty values
- `icons`, `cursor`, `scrollbar`, and `mascot` sections are all optional — only include them if you actually generated the assets
- `particle-shape` is only used when `particles` is `"custom"`
- `pattern` and `pattern-opacity` are only needed when a pattern SVG was generated
- `font.family` is applied to `--font-sans` and `--font-mono` CSS variables. Always include `'Cascadia Mono', monospace` as fallbacks
- `font.google-font-url` is a Google Fonts `@import` URL. The app injects this into the `<head>` at theme load time. Omit if using a system font
- `shape.radius` controls bare `rounded` elements (status bar pills, quick chips, permission buttons). Defaults to `radius-sm` if omitted
- **`chrome-style: "floating"`** elevates ALL chrome bars at once — header, input, and status bar gain margins, rounded corners, and subtle shadows so they appear as detached floating cards. The bottom chrome order is **status bar above input bar** (header → chat → status → input). Individual element `*-style` keys (e.g. `input-style`, `header-style`) still override the chrome-style for that specific element. Never use `position: absolute` on layout-flow elements in `custom_css` — the floating aesthetic is achieved with `align-self`, `width: fit-content`, `margin`, `border-radius`, and `box-shadow`.

### Step 6: Write Custom CSS Aggressively

Use the `custom_css` field for visual effects the schema cannot express. Include it as a single string (newlines escaped or using template literals). Always include at minimum:

**Always include:**
```css
::selection { background: rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.3); color: ACCENT_ON; }
```

**REQUIRED when the theme has a pattern overlay:**

The pattern MUST be added as a `body::after` fixed overlay in `custom_css`. This renders ON TOP of the terminal's WebGL canvas (which is opaque), making the pattern visible in both chat and terminal views. Do NOT use `body::before` for this — `::before` renders behind body's children and will be hidden by the WebGL canvas.

The wallpaper image itself does NOT need an overlay — the app disables the WebGL renderer when glassmorphism is active, so `body` background-image (set by the theme engine) shows through the terminal via the DOM renderer's CSS transparency.

```css
/* Pattern overlay — visible in both chat and terminal views */
body::after {
  content: ''; position: fixed; inset: 0;
  background-image: url('theme-asset://SLUG/assets/pattern.svg');
  background-size: 30px 30px; background-repeat: repeat;
  opacity: 0.10;
  pointer-events: none; z-index: 0;
}
```

Omit `body::after` if the theme has no pattern. Use `theme-asset://SLUG/...` URLs to reference local theme assets.

**ALSO REQUIRED when `panels-blur > 0` (glassmorphism themes):**

When a theme has `background.panels-blur > 0`, the app sets `data-panels-blur` on `<html>` and renders the wallpaper on `<body>`. You MUST include the following glassmorphism CSS block in `custom_css`. The glassmorphism effect blurs the body background through frosted panels in chat view — all content layers above need to be either transparent or frosted glass.

Adjust the opacity percentages to taste (lower = more transparent/wallpaper visible):
- **Bars** (header, status, input): 78-88% panel opacity, blur 20-28px
- **Assistant bubbles** (bg-inset): 80-90% inset opacity, blur 12-20px
- **User bubbles** (bg-accent): 50-80% accent opacity, blur 12-20px

```css
/* Make main app shell transparent so body wallpaper shows through */
[data-panels-blur] .app-shell { background-color: transparent !important; }

/* Header bar — frosted glass overlay, chat scrolls underneath */
[data-panels-blur] .header-bar {
  position: absolute; top: 0; left: 0; right: 0; z-index: 20;
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  background-color: color-mix(in srgb, var(--panel) 82%, transparent);
}

/* Push chat content below the overlaid header (h-10 = 40px) */
[data-panels-blur] .chat-scroll { padding-top: 3rem; }

/* Status bar — frosted glass */
[data-panels-blur] .status-bar {
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  background-color: color-mix(in srgb, var(--panel) 82%, transparent);
}

/* Input bar — frosted glass (skipped for minimal input-style, which stays fully transparent) */
[data-panels-blur]:not([data-input-style="minimal"]) .border-t.shrink-0:has(form) {
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  background-color: color-mix(in srgb, var(--panel) 82%, transparent);
}

/* Assistant chat bubbles — semi-transparent with subtle blur */
[data-panels-blur] .bg-inset {
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  background-color: color-mix(in srgb, var(--inset) 85%, transparent);
}

/* User message bubbles — semi-transparent accent */
[data-panels-blur] .bg-accent {
  backdrop-filter: blur(16px) saturate(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.1);
  background-color: color-mix(in srgb, var(--accent) 65%, transparent);
}
```

Key notes for glassmorphism:
- `color-mix(in srgb, var(--token) N%, transparent)` creates semi-transparent versions of theme tokens without needing to know their RGB values
- `saturate(1.2)` boosts the blurred wallpaper color through the frost — makes it feel warm/alive rather than washed out
- The header becomes `position: absolute` so chat content scrolls underneath the frosted bar
- The terminal view disables WebGL when glassmorphism is active, so `body` background-image (wallpaper) shows through via the DOM renderer. Patterns use `body::after` overlays which render on top of the canvas regardless of renderer

**Consider including (when they fit the theme):**
```css
/* Themed scrollbar with SVG */
::-webkit-scrollbar-thumb { background-image: url('theme-asset://SLUG/assets/scrollbar-thumb.svg'); background-size: contain; }
::-webkit-scrollbar-track { background: transparent; }

/* Custom cursor */
* { cursor: url('theme-asset://SLUG/assets/cursor.svg') 0 0, auto; }

/* Glow effects on accent elements */
[data-theme="SLUG"] .bg-accent { box-shadow: 0 0 20px rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.4); }

/* Animated gradient border on input */
[data-theme="SLUG"] .input-bar-container {
  border-image: linear-gradient(var(--angle, 0deg), ACCENT, ACCENT2) 1;
  animation: border-rotate 4s linear infinite;
}
@keyframes border-rotate { to { --angle: 360deg; } }

/* Themed focus rings — target buttons/links/selects only, NOT textarea/input
   (textarea focus creates an ugly colored box around the text input area) */
[data-theme="SLUG"] button:focus-visible,
[data-theme="SLUG"] a:focus-visible,
[data-theme="SLUG"] select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: 0 0 8px rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.3); }

/* Subtle text shadow on headings */
[data-theme="SLUG"] h1, [data-theme="SLUG"] h2 { text-shadow: 0 0 12px rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.2); }

/* Scan-line overlay enhancement */
[data-theme="SLUG"] .chat-area::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
  pointer-events: none;
  z-index: 10;
}
```

### Step 7: Confirm to User

Tell the user: "**[Theme Name]** is live in the app now. The app has hot-reloaded. What would you like to change?"

---

## Phase 3 — In-App Refinement

After the theme pack is written, every refinement the user requests goes directly to the manifest or asset files. Edit the specific field or regenerate the specific SVG, write the updated file. The app hot-reloads automatically.

Common refinements:
- "More X color" -> adjust `tokens.accent` or relevant token
- "Rounder edges" -> increase `shape.radius-*` values
- "More glassmorphism" -> increase `background.panels-blur`, lower `panels-opacity` to 0.7, adjust `custom_css` opacity percentages in `color-mix()` calls (lower = more transparent)
- "Add rain particles" -> set `effects.particles: "rain"`
- "Custom particles" -> set `effects.particles: "custom"`, generate a new particle shape SVG, update `effects.particle-shape`
- "Change the pattern" -> regenerate `assets/pattern.svg`, adjust `background.pattern-opacity`
- "Different wallpaper" -> download a new wallpaper, update `background.value`
- "Update the mascot" -> regenerate mascot SVGs in `assets/`
- "More glow" -> add or enhance `custom_css` glow effects
- "Custom effect" -> write CSS to `custom_css` field

---

## Token Design Rules

- `panel` should be slightly lighter/different from `canvas`
- `inset` is slightly lighter/different from `panel`
- `fg` through `fg-faint` form a descending opacity/contrast scale
- `on-accent`: use `#FFFFFF` if accent luminance < 0.179, else `#000000` (WCAG relative luminance threshold — NOT 0.4 or 0.5)
- `edge-dim` should be the edge color with 50% alpha (append `80` to hex)
- For glassmorphism: set `panels-blur: 8-16`, `panels-opacity: 0.6-0.85`, and ensure `canvas` has a visible gradient/image

### Contrast Requirements (Mandatory)

Before rendering a concept, verify these contrast ratios mentally. If any fail, adjust the tokens before rendering.

**Hard requirements (WCAG AA — must pass):**
- `fg` on `canvas` — 4.5:1 minimum. This is body text; it must be readable.
- `on-accent` on `accent` — 4.5:1 minimum. Buttons and user bubbles must be readable.
- `fg` on `inset` — 4.5:1 minimum. Assistant bubbles must be readable.

**Soft requirements (should pass, can bend for atmosphere):**
- `fg-2` on `canvas` — 3.5:1 minimum. Secondary text should be comfortable to read.
- `edge` must be visually distinct from both `canvas` and `panel`. If the user can't tell where a panel ends, the border is too subtle.

**No requirements (decorative — creative freedom):**
- `fg-dim`, `fg-muted`, `fg-faint` — These tokens exist to de-emphasize. Low contrast is intentional and allowed.

**Quick mental check:** On a dark theme, if `canvas` is below `#1a1a1a`, `fg` should be above `#c0c0c0`. On a light theme, if `canvas` is above `#e0e0e0`, `fg` should be below `#333333`.

### Surface Luminance Ordering

For **dark themes** (`dark: true`):
```
luminance(canvas) ≤ luminance(well) ≤ luminance(panel) ≤ luminance(inset)
```
Surfaces get progressively lighter as they are more "raised" or nested.

For **light themes** (`dark: false`):
```
luminance(canvas) ≥ luminance(well) ≥ luminance(panel) ≥ luminance(inset)
```
Surfaces get progressively darker as they are more "raised" or nested.

Breaking this ordering makes the UI feel inverted and confusing. The `well` token is the deepest recess; `inset` is the most raised nested surface.

### Palette Temperature Guidelines

Use these as starting points when interpreting the user's vibe — not as rigid constraints:

- **Warm** (cozy, autumn, firelight, amber): Canvas in warm grays/browns `#1a1208`–`#2a1e10`. Accent in amber/gold `#d4a030`–`#ffc060`. Foreground in cream/warm white `#f0e0c0`–`#f8ecd0`.
- **Cool** (ocean, ice, moonlight, serene): Canvas in blue-grays `#0a1018`–`#141e2a`. Accent in teal/cyan `#40b0c0`–`#80d0e0`. Foreground in cool white `#d0dae0`–`#e8f0f4`.
- **Neon** (cyberpunk, synthwave, electric): Canvas in near-black `#080810`–`#10101a`. Accent in hot magenta/cyan `#ff004c`–`#00ffff`. Use `custom_css` for glow effects (`box-shadow`, `text-shadow`).
- **Pastel** (soft, kawaii, dreamy): Canvas in light pastels `#f0e8f0`–`#faf0f4` (usually `dark: false`). Accent in medium pastels `#ff88aa`–`#88bbff`. Keep effects minimal — pastels compete with heavy effects.
- **Earth** (forest, stone, natural): Canvas in deep greens/browns `#0a0f08`–`#1a1810`. Accent in moss/terracotta `#6a8a4a`–`#c07040`. Pattern overlays work well (leaf shapes, organic lines).
- **Monochrome** (minimal, clean, editorial): Pick one hue family and vary only saturation and lightness. Accent is the same hue at full saturation. Elegant but can feel sterile — add texture via pattern overlays.

### Glassmorphism panels-opacity

When `panels-opacity < 1`, the app renders panel backgrounds as semi-transparent RGBA (panel hex color with the specified alpha). This lets the background gradient/image show through blurred panels. The concept card must replicate this by computing the `--panel-glass` CSS variable:

```
panel hex: #161B22, panels-opacity: 0.75
-> --panel-glass: rgba(22, 27, 34, 0.75)
```

### Effect Intensity Starting Points

These are calibrated defaults for ambient, daily-driver themes. Increase for dramatic/immersive themes ("blizzard", "cyberpunk rave"), decrease for minimal/productivity themes.

| Effect | Default Range | Too Low | Too High |
|--------|--------------|---------|----------|
| `particle-count` | 20–30 | <10 (invisible) | >50 (distracting, perf hit) |
| `particle-speed` | 0.3–0.5 | <0.1 (frozen) | >0.8 (frantic) |
| `particle-drift` | 0.2–0.4 | 0 (straight lines) | >0.7 (chaotic) |
| `particle-size-range` | [4, 12] | [1, 3] (invisible) | [20, 40] (dominant) |
| `vignette` | 0.15–0.25 | <0.05 (invisible) | >0.4 (tunnel vision) |
| `noise` | 0.02–0.05 | <0.01 (invisible) | >0.1 (TV static) |
| `panels-blur` | 12–20px | <6 (barely frosted) | >30 (everything lost) |
| `panels-opacity` | 0.70–0.85 | <0.5 (can't read through it) | >0.95 (no glass effect) |
| `pattern-opacity` | 0.04–0.08 | <0.02 (invisible) | >0.15 (overpowering) |

### Dark vs. Light Mode Auto-Detection

When interpreting the user's prompt, consider which mode the vibe naturally suggests:

- **Usually dark:** cyberpunk, neon, midnight, space, ocean depths, noir, moody
- **Usually light:** pastel, kawaii, cottagecore, minimal, paper, cream, summer
- **Could go either way:** autumn, forest, vintage, retro, steampunk

When the vibe is ambiguous, include at least one dark and one light concept among the 3 options in Round 1. This gives the user a choice early rather than discovering they wanted the opposite after multiple rounds.

### Exemplar Theme Reference

For a complete, production-quality theme manifest with all features, read:
```
destincode/desktop/src/renderer/themes/community/golden-sunbreak/manifest.json
```
This demonstrates correct token ratios, glassmorphism values, effect calibration, asset paths, layout presets, and custom CSS. Use it as a quality reference — not a template to copy from.

---

## Asset Strategy Quick Reference

| Asset | Brand/IP Mode | Vibe/Abstract Mode |
|---|---|---|
| Hero wallpaper | Web search -> download real imagery | Unsplash/stock or CSS gradient |
| Repeating patterns | Traced from brand elements or web-sourced | Claude-generated SVG |
| Custom particle shapes | Simplified from brand iconography | Claude-generated SVG |
| Icon overrides | Simplified from brand imagery | Claude-generated outlined SVG |
| Mascot crossovers | Brand-accurate accessories on base template | Creative thematic accessories |
| Scrollbar art | CSS + optional SVG | CSS + optional SVG |
| Cursor | Brand-relevant shape | Thematic shape (or omit) |

---

## Rules

- NEVER modify files in `src/renderer/themes/builtin/` — those are built-in themes
- NEVER write to any path inside the app bundle (`destincode/desktop/src/`)
- Always validate that `slug` is kebab-case with no spaces
- If the user gives a theme name with spaces, auto-convert: "Tokyo Rain" -> "tokyo-rain"
- All asset paths in manifest.json MUST be relative to the theme folder (e.g. `assets/wallpaper.png`)
- No absolute paths or external URLs allowed in saved manifests — all assets must be local
- Download external images at theme creation time, save to `assets/`
- Use `custom_css` for effects the schema doesn't cover (CSS animations, ::before overlays, etc.)
- NEVER set `border-radius` on `.assistant-bubble`, `.user-bubble`, or any variable-height content container in `custom_css`. Use the `bubble-style` layout preset and `shape` radius values instead. Setting `border-radius: 9999px` or `var(--radius-full)` on bubbles creates semicircular caps that clip multi-line content — only fixed-height elements (input bars, status pills, dots) are safe for `radius-full`.
- The preview CSS file and the app's globals.css are a CONTRACT — they define the same classes. If either changes, both must stay in sync.
- When generating mascot SVGs, ALWAYS start from the base templates above. Never create mascots from scratch.
- Particle shape SVGs should be simple enough to render at 8-16px without losing detail.
- Pattern SVGs must tile seamlessly — test by imagining the tile repeated in a grid.
