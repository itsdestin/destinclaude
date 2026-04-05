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

2. Generate 3 theme concepts based on the user's prompt. Each concept is just a name, palette, and vibe — NOT a full theme.json yet.

3. Render them as concept cards using the visual companion (write an HTML file to `screen_dir`). Use this card template for each theme:
   - A mini app preview (header bar div + chat area div + input div) using the theme's colors
   - Theme name + 4-5 color swatches
   - 1-sentence vibe description
   - Label the layout/effects you plan (e.g., "floating input · rain particles · glassmorphism")

4. Tell the user the URL and ask them to look while iterating in chat.

**Iteration loop:** User requests changes → re-render in the browser. Loop until the user says "go with [option]", "build [name]", or "apply [number]".

## Phase 2 — Full Theme Generation

**When the user picks a concept:**

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

Token design rules:
- `panel` should be slightly lighter/different from `canvas`
- `inset` is slightly lighter/different from `panel`
- `fg` through `fg-faint` form a descending opacity/contrast scale
- `on-accent`: use `#FFFFFF` if accent luminance < 0.4, else `#000000`
- For glassmorphism: set `panels-blur: 8-16`, `panels-opacity: 0.6-0.85`, and ensure `canvas` has a visible gradient/image

2. Write the file to `~/.claude/destinclaude-themes/<slug>.json` using the Write tool.

3. Tell the user: "**[Theme Name]** is live in the app now. The app has hot-reloaded. What would you like to change?"

## Phase 3 — In-App Refinement

After the file is written, every refinement the user requests goes directly to the JSON file. Edit the specific field, write the updated file. The app hot-reloads automatically.

Common refinements:
- "More X color" → adjust `tokens.accent` or relevant token
- "Rounder edges" → increase `shape.radius-*` values
- "More glassmorphism" → increase `background.panels-blur`, set `panels-opacity: 0.7`
- "Add rain particles" → set `effects.particles: "rain"`
- "Custom effect" → write CSS to `custom_css` field

## Rules

- NEVER modify files in `src/renderer/themes/builtin/` — those are built-in themes
- NEVER write to any path inside the app bundle (`desktop/src/`)
- Always validate that `slug` is kebab-case with no spaces
- If the user gives you a theme name with spaces, auto-convert: "Tokyo Rain" → "tokyo-rain"
- Use `custom_css` for effects the schema doesn't cover (CSS animations, ::before overlays, etc.)
