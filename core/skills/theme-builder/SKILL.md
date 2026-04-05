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
- Shape radius values
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
  --radius-sm: Npx; --radius-md: Npx; --radius-lg: Npx; --radius-xl: Npx; --radius-2xl: Npx; --radius-full: 9999px;
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

    <div class="input-bar-container bg-panel">
      <div class="input-field">Type a message...</div>
      <div class="send-btn">&#9654;</div>
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
3. **Layout presets are data attributes** on `.app-mockup`: `data-input-style`, `data-bubble-style`, `data-header-style`, `data-statusbar-style`. The CSS handles the visual changes.
4. **Glassmorphism** requires BOTH:
   - `data-panels-blur` attribute on `.app-mockup` (or a wrapper)
   - `style="--panels-blur: Npx; --panel-glass: rgba(R,G,B,OPACITY);"` on the same element
   - Compute `--panel-glass` from the panel hex color + `panels-opacity` value
5. **Background layer**: Set `#theme-bg` inside `.app-mockup` with the exact `background` and `opacity` from the concept's background config. For solid backgrounds, omit the `#theme-bg` div entirely.
6. **Pattern overlay**: Use `.pattern-overlay` inside `.app-mockup` with a data-URI SVG `background-image` and `background-size` to show repeating patterns. Set opacity via the `opacity` style property. Use data-URI inline SVGs so the pattern is visible in the preview without external files.
7. **Asset preview row**: Show thumbnails for planned assets. For wallpapers in brand mode, show the image you plan to download. For generated SVGs, show a tiny inline data-URI preview. For items that will be generated later, use a colored placeholder with an icon label.
8. **Particles are label-only** in the preview. Show a `.particle-indicator` badge with the preset name (e.g. "rain", "custom hearts", "brand stars"). Omit it for `"none"`.
9. **Embed the full `theme-preview.css` contents** in a `<style>` tag in the HTML `<head>`. Do NOT link to an external file.
10. **Page layout**: show concept cards in a responsive grid (1-3 columns). The page background should be `#1a1a1a` (neutral dark) so all themes are evaluated against the same backdrop.

---

## Phase 2 — Theme Pack Generation

**When the user picks a concept from the second (or later) round:**

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
- Prefer 1920x1080 or higher resolution
- Prioritize images that work well as a subtle background (not too busy, good as a blurred backdrop)

**Vibe/Abstract Mode:**
- Use WebSearch to find atmospheric stock photos (Unsplash, Pexels, etc.)
- Use WebFetch to download the image
- Alternatively, use a CSS gradient in `background.value` if no wallpaper is needed
- Save to `<slug>/assets/wallpaper.png`

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
    "radius-sm": "Npx",
    "radius-md": "Npx",
    "radius-lg": "Npx",
    "radius-full": "9999px"
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
    "input-style": "default | floating | minimal | terminal",
    "bubble-style": "default | pill | flat | bordered",
    "header-style": "default | minimal | hidden",
    "statusbar-style": "default | minimal | floating"
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

### Step 6: Write Custom CSS Aggressively

Use the `custom_css` field for visual effects the schema cannot express. Include it as a single string (newlines escaped or using template literals). Always include at minimum:

**Always include:**
```css
::selection { background: rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.3); color: ACCENT_ON; }
```

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

/* Themed focus rings */
[data-theme="SLUG"] *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; box-shadow: 0 0 8px rgba(ACCENT_R, ACCENT_G, ACCENT_B, 0.3); }

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
- "More glassmorphism" -> increase `background.panels-blur`, lower `panels-opacity` to 0.7
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

### Glassmorphism panels-opacity

When `panels-opacity < 1`, the app renders panel backgrounds as semi-transparent RGBA (panel hex color with the specified alpha). This lets the background gradient/image show through blurred panels. The concept card must replicate this by computing the `--panel-glass` CSS variable:

```
panel hex: #161B22, panels-opacity: 0.75
-> --panel-glass: rgba(22, 27, 34, 0.75)
```

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
- NEVER write to any path inside the app bundle (`desktop/src/`)
- Always validate that `slug` is kebab-case with no spaces
- If the user gives a theme name with spaces, auto-convert: "Tokyo Rain" -> "tokyo-rain"
- All asset paths in manifest.json MUST be relative to the theme folder (e.g. `assets/wallpaper.png`)
- No absolute paths or external URLs allowed in saved manifests — all assets must be local
- Download external images at theme creation time, save to `assets/`
- Use `custom_css` for effects the schema doesn't cover (CSS animations, ::before overlays, etc.)
- The preview CSS file and the app's globals.css are a CONTRACT — they define the same classes. If either changes, both must stay in sync.
- When generating mascot SVGs, ALWAYS start from the base templates above. Never create mascots from scratch.
- Particle shape SVGs should be simple enough to render at 8-16px without losing detail.
- Pattern SVGs must tile seamlessly — test by imagining the tile repeated in a grid.
