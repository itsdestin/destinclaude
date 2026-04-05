---
name: theme-builder
description: Build custom DestinCode themes. Invoke as /theme-builder "your vibe description". Two-phase: concept browser first, then full theme generation into the app.
---

# /theme-builder

Build a custom DestinCode theme. Claude generates concept options in a browser window first — no app changes — then implements the chosen theme as a hot-reloading JSON file.

## Phase 1 — Concept Browser

**When the user invokes this skill:**

1. Start the visual companion server:
   ```bash
   bash "~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/scripts/start-server.sh" --project-dir ~/.claude/destinclaude-themes
   ```
   Use `run_in_background: true`. Then read the `server-info` file after 3 seconds.

2. Read the preview CSS file for embedding in your HTML:
   ```
   core/skills/theme-builder/theme-preview.css
   ```
   This CSS replicates the app's exact rendering. You MUST embed it in every HTML file you write.

3. Generate **3 theme concepts** based on the user's prompt. For each concept, decide:
   - A palette (all 15 tokens — see Token Design Rules below)
   - Shape radius values
   - Background type (solid, gradient, or image)
   - Layout presets (input-style, bubble-style, header-style, statusbar-style)
   - Effects (particles, glassmorphism settings)

4. Render them as concept cards by writing an HTML file to `screen_dir`. Follow the **Concept Card Rendering Spec** below exactly.

5. Tell the user the URL and ask them to look while iterating in chat.

**Two-round minimum:** After the user picks a concept ("I like option 2", "go with Midnight Rain"), you MUST generate **3 refined variations** of that concept automatically — even if the user doesn't ask for another round. Explain: "Here are 3 refined takes on [name]. Pick your favorite, or tell me what to change." Only proceed to Phase 2 after the user confirms from the second round.

**Iteration loop:** User requests changes → re-render in the browser. They can request unlimited additional rounds. Proceed to Phase 2 when the user says "build it", "apply it", "go", or similar.

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
  --radius-sm: Npx; --radius-md: Npx; --radius-lg: Npx; --radius-full: 9999px;
">
  <!-- Theme name + vibe -->
  <h2 class="text-fg" style="font-size:16px; font-weight:700;">Theme Name</h2>
  <p class="text-fg-muted" style="font-size:11px;">One-sentence vibe description</p>

  <!-- Color swatches -->
  <div class="swatch-row">
    <div class="swatch" style="background: var(--canvas);" title="canvas"></div>
    <div class="swatch" style="background: var(--panel);" title="panel"></div>
    <div class="swatch" style="background: var(--inset);" title="inset"></div>
    <div class="swatch" style="background: var(--accent);" title="accent"></div>
    <div class="swatch" style="background: var(--fg);" title="fg"></div>
  </div>

  <!-- Feature labels -->
  <div class="concept-label">
    <span>floating input</span>
    <span>rain particles</span>
    <span>glassmorphism</span>
  </div>

  <!-- App mockup — this is what the user is really evaluating -->
  <div class="app-mockup"
       data-input-style="floating"
       data-bubble-style="default"
       data-header-style="default"
       data-statusbar-style="default">

    <!-- Background layer (for gradient/image themes) -->
    <div id="theme-bg" style="background: linear-gradient(...); opacity: 0.8;"></div>

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
    <div class="particle-indicator">rain</div>
  </div>
</div>
```

**Critical rendering rules:**

1. **All colors come from CSS custom properties** — never hardcode hex values in element styles except on the scoping `style="--canvas: ..."` attribute.
2. **Use the exact CSS classes** from `theme-preview.css`: `.bg-panel`, `.bg-canvas`, `.text-fg`, `.border-edge`, `.chat-bubble.user`, `.chat-bubble.assistant`, etc.
3. **Layout presets are data attributes** on `.app-mockup`: `data-input-style`, `data-bubble-style`, `data-header-style`, `data-statusbar-style`. The CSS handles the visual changes.
4. **Glassmorphism** requires BOTH:
   - `data-panels-blur` attribute on `.app-mockup` (or a wrapper)
   - `style="--panels-blur: Npx; --panel-glass: rgba(R,G,B,OPACITY);"` on the same element
   - Compute `--panel-glass` from the panel hex color + `panels-opacity` value
5. **Background layer**: Set `#theme-bg` inside `.app-mockup` with the exact `background` and `opacity` from the concept's background config. For solid backgrounds, omit the `#theme-bg` div entirely.
6. **Particles are label-only** in the preview. Show a `.particle-indicator` badge with the preset name. Omit it for `"none"`.
7. **Embed the full `theme-preview.css` contents** in a `<style>` tag in the HTML `<head>`. Do NOT link to an external file.
8. **Page layout**: show concept cards in a responsive grid (1-3 columns). The page background should be `#1a1a1a` (neutral dark) so all themes are evaluated against the same backdrop.

---

## Phase 2 — Full Theme Generation

**When the user picks a concept from the second (or later) round:**

1. Generate the complete theme JSON matching this schema exactly:

```json
{
  "name": "string — display name",
  "slug": "kebab-case-slug — used as filename and data-theme",
  "dark": true,
  "author": "claude",
  "created": "YYYY-MM-DD",
  "tokens": {
    "canvas": "#hex", "panel": "#hex", "inset": "#hex", "well": "#hex",
    "accent": "#hex", "on-accent": "#hex (white if accent dark, black if light)",
    "fg": "#hex", "fg-2": "#hex", "fg-dim": "#hex",
    "fg-muted": "#hex", "fg-faint": "#hex",
    "edge": "#hex", "edge-dim": "#hex80 (add 50% alpha)",
    "scrollbar-thumb": "#hex", "scrollbar-hover": "#hex"
  },
  "shape": {
    "radius-sm": "Npx", "radius-md": "Npx", "radius-lg": "Npx", "radius-full": "9999px"
  },
  "background": {
    "type": "solid | gradient | image",
    "value": "color or gradient or url",
    "opacity": 1,
    "panels-blur": 0,
    "panels-opacity": 1.0
  },
  "layout": {
    "input-style": "default | floating | minimal | terminal",
    "bubble-style": "default | pill | flat | bordered",
    "header-style": "default | minimal | hidden",
    "statusbar-style": "default | minimal | floating"
  },
  "effects": {
    "particles": "none | rain | dust | ember | snow",
    "scan-lines": false,
    "vignette": 0,
    "noise": 0
  },
  "custom_css": ""
}
```

### Token Design Rules

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
→ --panel-glass: rgba(22, 27, 34, 0.75)
```

2. Write the file to `~/.claude/destinclaude-themes/<slug>.json` using the Write tool.

3. Tell the user: "**[Theme Name]** is live in the app now. The app has hot-reloaded. What would you like to change?"

## Phase 3 — In-App Refinement

After the file is written, every refinement the user requests goes directly to the JSON file. Edit the specific field, write the updated file. The app hot-reloads automatically.

Common refinements:
- "More X color" → adjust `tokens.accent` or relevant token
- "Rounder edges" → increase `shape.radius-*` values
- "More glassmorphism" → increase `background.panels-blur`, lower `panels-opacity` to 0.7
- "Add rain particles" → set `effects.particles: "rain"`
- "Custom effect" → write CSS to `custom_css` field

## Rules

- NEVER modify files in `src/renderer/themes/builtin/` — those are built-in themes
- NEVER write to any path inside the app bundle (`desktop/src/`)
- Always validate that `slug` is kebab-case with no spaces
- If the user gives you a theme name with spaces, auto-convert: "Tokyo Rain" → "tokyo-rain"
- Use `custom_css` for effects the schema doesn't cover (CSS animations, ::before overlays, etc.)
- The preview CSS file and the app's globals.css are a CONTRACT — they define the same classes. If either changes, both must stay in sync.
