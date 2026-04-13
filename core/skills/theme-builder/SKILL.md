---
name: theme-builder
description: Build immersive DestinCode theme packs. Invoke as /theme-builder "your vibe description". Users can start from a general vibe, a specific detailed brief, or by uploading their own wallpaper. Three-phase — concept browser, then Kit refinement (swap palette/layout/bubble/font/effects/wallpaper/mascots/icons per column), then theme pack finalization.
---

# /theme-builder

Build a custom DestinCode theme pack. Three starting modes:

- **General vibe** — a short prompt like "cozy autumn", "cyberpunk", or "Hello Kitty". Claude designs the look from scratch.
- **Specific detailed description** — a longer brief covering palette, fonts, layout, mood, references. Claude follows it precisely.
- **Upload your own wallpaper** — the user drops in an image and Claude builds the theme around it.

Claude generates 3 concept options in a browser window first — no app changes. After the user picks one, they land on the **Kit**, a single-page builder where every part of the theme (palette, chrome, bubble, font, effects, wallpaper, mascots, icons) is a swappable column. Most refinement happens there, not in chat. When the user clicks Build, Claude finalizes the theme pack (folder with manifest + assets) and the app hot-reloads from it.

### Wallpaper recommendation (ask early)

Most themes use a wallpaper. **Always recommend the user provide their own** — it saves tokens and speeds things up. Ask upfront before generating concepts. Then:

- **User provides one wallpaper** — use it as the visual anchor for all 3 concepts. Differentiate concepts through palette, overlay tint, and effects — not by swapping the wallpaper out.
- **User wants Claude to find them** — **before searching, narrow the direction first.** A topic like "KPop Demon Hunters" or "Studio Ghibli" or "cyberpunk" branches in many directions. Searching blindly produces one mediocre round and wastes a second on course-correction. Instead, spend one turn sketching the axes:

  1. Think about what dimensions actually vary for this prompt. Typical ones:
     - **Medium** — realistic photo vs illustration vs animated-screencap vs painterly
     - **Tone** — dark/moody vs light/bright vs neon/saturated
     - **Subject** — main character vs full cast vs environment/setting vs symbolic/abstract
     - **Scene energy** — action moment vs quiet/atmospheric vs iconic pose
  2. Propose **3 starting directions** to the user as named bundles (e.g. *"A — main character, dark action scene; B — full cast, bright promo shot; C — environment, atmospheric"*). Two axes per bundle is enough; don't overspecify.
  3. Wait for the user to pick, merge, or override. Only then search.

  After user confirms, download **3 separate wallpapers** (one per concept) matching the chosen directions, before rendering concepts so each mockup has its own hero image.

  **Use `scripts/fetch-wallpaper.cjs` for the download.** It handles the two common failure modes that waste tool calls: CDN hot-link protection (stock-image sites return a ~20 KB placeholder unless the right Referer + User-Agent are sent) and gallery pages that don't serve a direct image (it extracts the `og:image` URL and fetches that). Usage: `node scripts/fetch-wallpaper.cjs <url> <out-path>`. The `<url>` can be either a direct image URL or a wallpaper-site page URL.

  **1080p rule:** Every wallpaper must be at least full HD — longest side ≥ 1920 px, shortest side ≥ 1080 px (either orientation). `fetch-wallpaper.cjs` reads the image header and rejects sub-HD downloads with a JSON error including the actual dimensions; on rejection, search for a higher-resolution source rather than shipping a blurry hero image.

  Skip this step if the user's prompt is already specific enough to pin medium + tone + subject (e.g. "dark noir black-and-white Blade Runner street scene") — there's nothing left to narrow.

---

## Phase 1 — Concept Browser

### Step 1: Start the Visual Companion Server

```bash
bash "core/skills/theme-builder/scripts/start-server.sh" --project-dir ~/.claude/destinclaude-themes
```

Use `run_in_background: true`. Then read the `server-info` file after 3 seconds.

### Step 2: Stage Assets for Preview Server

Copy preview CSS, helper script, and layout gallery into `screen_dir`:

```bash
cp core/skills/theme-builder/theme-preview.css "${screen_dir}/theme-preview.css"
cp core/skills/theme-builder/scripts/helper.js "${screen_dir}/helper.js"
cp core/skills/theme-builder/scripts/layout-gallery.html "${screen_dir}/layout-gallery.html"
```

All HTML files must link CSS via `<link rel="stylesheet" href="/files/theme-preview.css">`. Do NOT embed CSS inline. All asset references in HTML must use the `/files/` prefix (e.g. `src="/files/wallpaper.jpg"`). Bare filenames like `src="wallpaper.jpg"` resolve to 404.

### Step 3: Determine Prompt Mode

Analyze the user's prompt and determine the mode **automatically** — never ask:

**Brand/IP Mode** — references a recognizable character, brand, franchise, or product.
- Research-first: web search for authentic imagery, official color palettes, recognizable iconography
- Brand fidelity is paramount

**Vibe/Abstract Mode** — describes an aesthetic, mood, setting, or abstract concept.
- Creative-first: Claude designs original visual identities
- Freedom to invent color stories, effects, and atmospheric touches

### Step 4: Generate 3 Theme Concepts

**Before designing anything, read three files in parallel:**

```
scripts/concept-page-template.html    — page shell to fill in
scripts/app-mockup-chrome.html        — canonical chrome body (icons + layout)
scripts/manifest-template.jsonc       — final manifest schema
```

Concept-page-template handles page layout, script wiring, and the click→brainstorm event — none of that belongs in your generated HTML. App-mockup-chrome is the verbatim chrome block each concept's `.app-mockup` gets (see Concept Card Structure below). Manifest-template is read **in Phase 1** (not deferred to Phase 2) so you frame concept tokens in the final manifest shape from the start — no transcription churn at "build it."

**Optional but recommended:** browse `scripts/palettes/*.json` for pre-validated 15-token starter kits (cozy-autumn, dark-noir, neon-cyber, cottagecore, etc.). If one matches the user's vibe, start from it and tweak — faster and less likely to fail contrast than inventing from scratch.

Once you have the template in context, design **3 genuinely different interpretations** of the prompt — not 3 slight variations.

**Differentiator rule:** Each of the 3 concepts MUST differ from the others on **at least 2** of these axes: palette family, layout preset, font character, bubble shape, primary decorative effect. Three concepts that share everything except palette are one concept in three tints — regenerate.

For each concept, decide:

- A palette (all 15 tokens — see Token Design Rules below)
- Shape radius values
- A font choice — Google Font or system font that reinforces the vibe. Set `--font-sans` and `--font-mono`. Include a `<link>` for the Google Font in the page `<head>`.
- Background type (solid, gradient, or image) — if wallpapers were downloaded (one per concept), each concept uses its own wallpaper. Only use gradient/solid if a concept's design identity explicitly calls for it.
- Layout presets (input-style, bubble-style, header-style, statusbar-style)
- Effects (particles, scan-lines, vignette, noise)
- Pattern overlay, icon overrides, mascot crossover plan, custom CSS effects

#### Concept Card Structure

Each concept card is a `.concept-card` div with `data-choice="A"` (or B, C). Set all CSS tokens as inline `style="--canvas: #HEX; ..."` on the scoping div. Inside each card:

1. **Theme name** (`<h2>`) and **one-sentence vibe** (`<p>`)
2. **Swatch row** — 5 color swatches (canvas, panel, inset, accent, fg)
3. **Vibe tags** — `.concept-label` spans listing planned features (e.g. "floating input", "glassmorphism")
4. **App mockup** — `.app-mockup` div with `data-mockup` plus `data-*-style` layout attributes and inline glass vars. **Do NOT inline any chrome HTML.** The concept-page-template loads `scripts/mockup-render.js`, which scans the page for `[data-mockup]` elements and injects the canonical chrome — settings gear, session pill, chat/terminal toggle, attach/compass/send icons, model/permission/usage chips — from a central template. Concepts author only the outer div and its data attributes:

   ```html
   <div class="app-mockup"
        data-mockup
        data-wallpaper="/files/wallpaper-a.jpg"
        data-session="main"
        data-session-color="green"
        data-model="Opus 1M"
        data-permission="NORMAL"
        data-usage="23"
        data-asst1="Rumi, Mira, Zoey — ready when you are."
        data-user="Light the Honmoon"
        data-asst2="Barrier holding at 98%."
        data-tool-card="read · honmoon.json"
        data-fx="vignette"
        data-input-style="floating"
        data-bubble-style="pill"
        style="--panels-blur: 14px; --panels-opacity: 0.72; --bubble-blur: 10px; --bubble-opacity: 0.78; --vignette-opacity: 0.28;">
   </div>
   ```

   `data-fx` accepts space-separated values: `vignette`, `noise`, `scanlines`. The mockup-render script handles everything inside `.app-mockup` — you never write the chrome HTML directly. This cuts per-concept HTML from ~1 KB to ~300 bytes and guarantees icons/toggles/send-arrow are identical across concepts.

   For reference, the full chrome template that mockup-render injects lives at `scripts/app-mockup-chrome.html` (structural spec) and inside `scripts/mockup-render.js` (runtime source). You rarely need to open either — just set the data attributes above.

Use the exact CSS classes from `theme-preview.css`. All colors from CSS custom properties — never hardcode hex in element styles except on the scoping `.concept-card` div.

**Wallpaper compositing in the mockup** mirrors the real app: `#theme-bg` paints the wallpaper across the whole mockup box, `.chat-area` is transparent, and chrome bars (header/input/status) sit on top as `color-mix()` + `backdrop-filter` glass. Don't add a background to `.chat-area` or give chrome bars a fully opaque `--panels-opacity` — either will hide the wallpaper. To preview the wallpaper clearly, keep `--panels-opacity` in the 0.55–0.85 range when a wallpaper is set.

**Identical send arrow across concepts.** The send button SVG path is `M5 12h14M12 5l7 7-7 7` — use it everywhere. Any concept that substitutes ▶ / → / ▲ or a custom shape is wrong and will be rejected at review.

**Glassmorphism in mockups**: set `style="--panels-blur: Npx; --panels-opacity: N; --bubble-blur: Npx; --bubble-opacity: N;"` on the `.app-mockup` wrapper. `theme-preview.css` applies glass unconditionally via `color-mix()` + `backdrop-filter`, so you don't need any attribute gate. At defaults (`0px` / `1`) rules are a visual no-op.

### Step 5: Tell the User + Quick-Apply

Tell the user the URL. They pick a concept by clicking a card — the server logs a `choice` event. On pick, immediately seed a minimal `_preview`:

```bash
mkdir -p ~/.claude/destinclaude-themes/_preview
```

Write `manifest.json` with tokens, shape, layout, effects, and font from the selected concept — no asset paths yet. The app auto-switches to `_preview` and auto-reverts when the folder is deleted, so the user sees the theme live while Kit-refining.

> **Slug invariant (critical — silent failure):** The manifest's internal `"slug"` field MUST be `"_preview"` during the Kit phase, matching the directory name. The renderer keys hot-reload auto-switch off the directory name, then looks up the loaded theme by its internal `.slug`. If they don't match (e.g. you used the final theme slug like `"strawberry-kitty"` while the folder is still `_preview`), the auto-switch fires but resolves to the default built-in theme instead — the app appears to silently ignore the preview. Only rename the slug field to its final value in Phase 2 when you move the folder to `~/.claude/destinclaude-themes/<final-slug>/`.

Then move to Phase 1.5 (the Kit) instead of open-ended chat iteration. Keep the concept browser URL in case the user asks to revisit alternates, but Kit is the default next surface.

---

## Phase 1.5 — Kit Refinement

After concept pick, the user lands on the **Kit** — one page with eight columns they can swap independently. This is the primary authoring surface; most refinement happens here, not in chat.

The eight columns:

| Column | Kind | What it does |
|---|---|---|
| Palette | preset + override | Swap the 15-token color set |
| Chrome & Layout | preset + override | `chrome-style` / `input-style` / `header-style` / `statusbar-style` |
| Bubble Style | preset + override | `bubble-style` preset |
| Font | preset + override | Swap Google Font, auto-linked on rebuild |
| Effects | multi + override | Particles (pick one) + overlay textures (vignette / noise / scanlines) |
| Wallpaper | review + override | Keep the hero image, or describe a change |
| Mascots | review + override | Keep the 4 mascot variants, or describe changes |
| Icons & Details | review + override | Keep icon overrides / cursor / scrollbar, or describe changes |

### Step 5a: Generate Baseline Assets

Before rendering Kit, generate the assets Kit needs to show in review columns. Write them into `_preview/assets/` so the live app hot-loads them alongside the manifest, AND copy them to `screen_dir` so Kit can reference them via `/files/`.

> **Write order matters — manifest LAST.** Assets first, manifest second. The chokidar watcher fires a reload per file; if the manifest exists before all assets, the reload reads it and the app briefly renders with broken asset URLs. Writing manifest last lets the debounce collapse everything to one clean event after all files are present.

1. **Hero wallpaper** — copy the chosen concept's wallpaper to `_preview/assets/wallpaper.<ext>` and `${screen_dir}/wallpaper.<ext>`.
2. **Mascots** (4 variants, if the theme has them) — read all 4 `scripts/base-mascot-*.svg` templates, follow the **Mascot rendering rules** (white body + `currentColor` stroke, features drawn on top, not cutouts — see Phase 2 Step 4 below for the full ruleset). Write `_preview/assets/mascot-{idle,welcome,shocked,dizzy}.svg` and mirror into `screen_dir`.
3. **Icon overrides** — only the slots the concept calls for. `_preview/assets/icon-<slot>.svg` + mirror.
4. **Pattern SVG** — only if the concept has a pattern. `_preview/assets/pattern.svg` + mirror.
5. **Manifest LAST** — `_preview/manifest.json` with relative asset paths. If a concept has no mascot / icon / pattern, just don't generate those — the matching Kit columns hide themselves automatically.

### Verify the preview activated

After writing the manifest, tell the user: "The app should auto-switch to the preview. If you don't see it apply within a few seconds, say so." Don't assume success — silent activation failure is the most common way this skill has broken historically.

If the user reports no visible change, the fallback is **rename `_preview` → final-slug immediately** (skip the Kit refine step). That promotes the theme into the user's theme picker so they can select it manually. You lose the auto-hot-reload magic but the user gets a working theme. Symptoms of silent failure include:

- User on an older packaged build (pre-chokidar fix) — `fs.watch` misses new subdirs on Windows
- Manifest.json slug field doesn't match directory name (`_preview`) — renderer falls back to default theme. This is now warned in the DevTools console — ask the user to check.
- Watcher event fired before renderer mounted its listener — race condition

### Step 5b: Stage the Kit Page

```bash
cp core/skills/theme-builder/scripts/kit-refinement-template.html "${screen_dir}/screen.html"
cp core/skills/theme-builder/scripts/kit-presets.json "${screen_dir}/kit-presets.json"
```

Fill in these placeholders in `screen.html`:

- `<!-- THEME_NAME -->` — concept's display name.
- `<!-- GOOGLE_FONTS -->` — `<link>` tags for the concept's font.
- `<!-- CURRENT_MOCKUP -->` — one `<div class="app-mockup" data-mockup …>` with selected concept's data-attrs and glass vars. Identical shape to concept card mockups; `mockup-render.js` injects the chrome.
- Each preset-kind column: set `data-current="<preset-id>"` on the `<section>` and fill `CURRENT_<COL>_NAME` / `CURRENT_<COL>_BLURB`. Preset ids come from `kit-presets.json` (e.g. `warm-cozy`, `floating`, `pill`, `nunito`). Use `custom` if the concept doesn't match any preset — no card gets green-highlighted.
- `effects` column: `data-current-particles="<id>"` and `data-current-overlays="vignette,noise"` (comma-separated list of currently-on overlays).
- `<!-- WALLPAPER_PREVIEW -->` — `<img src="/files/wallpaper.<ext>">`.
- `<!-- MASCOT_PREVIEW -->` — 4 `.asset-tile` divs, one per variant, each wrapping the mascot SVG. Leave empty or set `data-hidden="true"` on the column if no mascots.
- `<!-- ICONS_PREVIEW -->` — icon tiles + cursor + scrollbar strip. Hide column if none.

Everything else renders from `kit-presets.json` at page load — don't inline preset cards.

### Step 5c: Process Kit Submissions

Kit sends a `kit-submit` WebSocket event:

```json
{
  "type": "kit-submit",
  "intent": "rebuild" | "build",
  "changes": {
    "palette":  { "action": "preset"|"override"|"keep", "value": "<preset-id>", "note": "..." },
    "chrome":   { ... },
    "bubble":   { ... },
    "font":     { ... },
    "effects":  { "action": "preset", "particles": "<id>", "overlays": ["vignette","noise"], "note": "..." },
    "wallpaper":{ "action": "keep"|"change", "note": "brighter, wider" },
    "mascots":  { ... },
    "icons":    { ... }
  }
}
```

Events flow through the existing WebSocket handler — they appear in server stdout as `{"source":"user-event", "type":"kit-submit", ...}`. Read the server log to see submissions.

On `intent: "rebuild"`:
1. For each column with `action === "preset"` — apply the matching preset from `kit-presets.json` to `_preview/manifest.json`. Palette preset → copy tokens + shape + suggested font. Chrome preset → copy the `layout` sub-object. Bubble → set `layout.bubble-style`. Font → set `font.family` + `font.google-font-url`.
2. For each column with `action === "override"` (preset kinds) or `action === "change"` (review kinds) — interpret `note` and regenerate that slice. Palette override → new 15-token set (pipe through `check-contrast.cjs --tokens-json -`). Mascot change → regenerate the 4 SVGs. Wallpaper change → fetch a new hero via `fetch-wallpaper.cjs`.
3. Re-copy updated assets to `screen_dir` so `/files/` paths serve fresh content.
4. Rewrite `screen.html` with updated `data-current` attrs and preview blocks. The file-watcher auto-reloads the browser.

On `intent: "build"` → proceed to Phase 2 (Finalize & Ship).

**Escape hatch:** if the user explicitly asks to "show me more options," copy `concept-page-template.html` back over `screen.html` and regenerate concepts. Default flow stays on Kit.

---

## Phase 2 — Finalize & Ship

When the Kit user clicks **Build Theme Pack** (intent `"build"`), promote `_preview` to a real theme folder, bake the terminal-view wallpaper, write the final manifest + custom CSS, and run the contrast checker. Most assets already exist in `_preview/assets/` from Kit — you're mostly moving and packaging here, not regenerating.

### Step 1: Create the Theme Pack Folder

```bash
mkdir -p ~/.claude/destinclaude-themes/<slug>/assets
```

**Most assets already exist in `_preview/assets/`** from Phase 1.5 baseline generation and Kit rebuilds. Steps 2–4 below are mostly `cp` operations; only regenerate what's missing.

### Step 2: Move the Hero Wallpaper

```bash
cp ~/.claude/destinclaude-themes/_preview/assets/wallpaper.<ext> \
   ~/.claude/destinclaude-themes/<slug>/assets/wallpaper.<ext>
```

If somehow the wallpaper isn't in `_preview/assets/` yet (user started with gradient/solid, or Kit never swapped in an image), fall back to:
- **User-provided wallpaper:** copy directly to `<slug>/assets/wallpaper.<ext>`.
- **Brand/IP Mode:** WebSearch for official/fan art → WebFetch → save.
- **Vibe/Abstract Mode:** WebSearch stock photos (Unsplash, Pexels) → WebFetch → save. Or use CSS gradient if no wallpaper needed.

### Step 2b: Bake the Terminal-View Wallpaper

Only for `type: "image"` themes. TerminalView renders a subtly blurred + darkened version of the wallpaper behind xterm so fine wallpaper detail doesn't fight with the terminal text. Default blur is 8px sigma + brightness 0.86 — a gentle soften that preserves wallpaper character, paired with xterm sitting at 0.6 opacity on top so the wallpaper reads clearly through the terminal. Skip this step for gradient/solid themes.

```bash
node scripts/prep-terminal-bg.cjs \
  ~/.claude/destinclaude-themes/<slug>/assets/wallpaper.<ext> \
  ~/.claude/destinclaude-themes/<slug>/assets/wallpaper-terminal.webp
```

Output is ~15–30 KB. Then add to `manifest.json`:

```json
"background": {
  "type": "image",
  "value": "theme-asset://<slug>/assets/wallpaper.<ext>",
  "terminal-value": "theme-asset://<slug>/assets/wallpaper-terminal.webp",
  ...
}
```

If you skip this step, TerminalView falls back to a runtime CSS `filter: blur()` on the sharp wallpaper — visually similar but costs GPU, and is automatically disabled under reduced-effects. Always pre-bake for shipped themes.

### Step 3: Move / Generate SVG Assets

Most SVGs are already in `_preview/assets/`. Copy what's there:

```bash
cp ~/.claude/destinclaude-themes/_preview/assets/*.svg \
   ~/.claude/destinclaude-themes/<slug>/assets/ 2>/dev/null
```

Only **generate** SVGs that aren't in `_preview` yet (usually because Kit didn't need them, e.g. cursor, particle shape, scrollbar thumb). Guidelines:
- **Pattern SVG** (`assets/pattern.svg`): Single seamlessly tiling tile, viewBox ~`0 0 40 40`, single fill color
- **Particle Shape SVG** (`assets/<name>.svg`): Single centered shape, simple enough for 8-16px render
- **Icon SVGs** (`assets/icon-<slot>.svg`): 24x24 viewBox, use `currentColor`. Slots: send, new-chat, settings, theme-cycle, close, menu
- **Cursor SVG** (`assets/cursor.svg`): 32x32 viewBox, hotspot at top-left. Only if it genuinely fits.
- **Scrollbar SVG** (`assets/scrollbar-thumb.svg`): Vertical, subtle.

### Step 4: Move / Generate Mascot Crossovers

Mascots usually already exist in `_preview/assets/mascot-{idle,welcome,shocked,dizzy}.svg` (generated in Phase 1.5 Step 5a, regenerated on Kit mascot-change). The `cp *.svg` in Step 3 already moved them.

Only generate here if the theme needs mascots but `_preview` doesn't have them yet.

**Read all 4 base templates before generating any mascot SVG:**
```
scripts/base-mascot-idle.svg       (>< squinting eyes)
scripts/base-mascot-welcome.svg    (sparkle eyes, waving)
scripts/base-mascot-shocked.svg    (tall oval eyes, O mouth, arms out)
scripts/base-mascot-dizzy.svg      (X-X eyes, zigzag mouth, drooped arms)
```

Modify the bases to create themed crossover versions. The key constraint: **preserve the core silhouette** (squat body, nub arms, stubby legs) while adding thematic accessories.

**What you can do:** Add accessories on top (hats, bows, capes), held items from arms, add surface patterns, add appendages (tail, wings), add ambient elements (sparkles, flames, leaves), add whiskers / other brand-specific face details.

**What you must NOT do:** Change basic body proportions, make it unrecognizable.

Write all 4 variants to `<slug>/assets/mascot-{idle,welcome,shocked,dizzy}.svg`.

#### Mascot rendering rules (non-negotiable)

The base templates use `currentColor` for the whole body + dark cutouts for eyes. That model breaks on any theme where the text color ends up close to the surface color — the body goes dark-on-dark and eye cutouts become invisible. Always use this safer pattern instead:

1. **Body: white fill + `currentColor` stroke**, not a `currentColor` fill. A 0.5–0.8 px stroke keeps the outline theme-aware (matches text color) while the white body guarantees contrast on any surface. Example:
   ```xml
   <path d="..." fill="#FFFFFF" stroke="currentColor" stroke-width="0.6"/>
   ```
2. **Draw eyes and mouth ON TOP of the body, never as cutouts.** Cutouts rely on the body having an opposite-luminance fill to the page background — not true in general themes. Drawn features always render. Use simple primitives:
   - Squinting `><` → two `<path>` polylines or 3-point lines with `stroke-linecap="round"`
   - Round / sparkle eyes → `<circle>` or `<ellipse>` filled with `currentColor`, small white `<circle>` highlights on top
   - Shocked O mouth → `<ellipse>` filled with `currentColor`
   - X-X eyes → two crossed `<line>` elements per eye, stroked in `currentColor`
   - Zigzag / squiggle mouth → polyline `<path>` with `stroke-linejoin="round"`

   **Do NOT use self-intersecting paths with `fillRule="evenodd"` for eyes.** They render inconsistently across SVG viewers (one eye can disappear, especially the second cutout in a multi-subpath `<path>`).
3. **Legs and arms follow the same pattern** — white fill, `currentColor` stroke — so the whole mascot is a cohesive outline-drawing.
4. **Theme-fixed accents are hardcoded hex, not CSS vars.** A pink skull on a Kuromi theme should be `fill="#FF4FB8"`, not `var(--accent)` — SVG doesn't re-evaluate CSS variables against the app's theme tokens when rendered via `<img>` / `background-image`. If you want a color that recolors with the theme, use `currentColor`; otherwise hardcode.
5. **Verify at 24 px.** Mascots most commonly render small. Stage all 4 in a browser preview page at 24 / 48 / 80 / 120 px, against canvas / panel / inset backgrounds, and confirm the expressions are distinguishable at 24 px. If any detail disappears at 24 px, simplify it.
6. **Keep feature positions consistent across variants.** Eyes roughly at `y ≈ 10`, mouth near `y ≈ 13`, hat accessories at `y ≈ 2–4`. Variance between variants should come from shape, not from re-positioning.

### Step 5: Write the Manifest

**Read `scripts/manifest-template.jsonc` before writing anything.** Do NOT reconstruct the manifest schema from memory — the template has field documentation, required vs optional markers, and correct structure. Copy it, fill in values, remove unused optional sections. Write to `<slug>/manifest.json`.

Key rules:
- All asset paths are **relative** to the theme folder
- Omit optional fields rather than including null/empty
- `on-accent`: use `#FFFFFF` if accent luminance < 0.179, else `#000000`
- `edge-dim`: edge color with 50% alpha (append `80` to hex)
- `font.family` always includes `'Cascadia Mono', monospace` as fallbacks

### Step 6: Write Custom CSS

**Read `scripts/custom-css-reference.md` before writing any CSS.** Do NOT write custom CSS from memory — the reference has required patterns and known-good snippets. Include at minimum:
- `::selection` highlight (always)
- Glassmorphism block (when `panels-blur > 0`)

Wallpaper and pattern are **manifest fields** (`background.value`, `background.pattern`), NOT `custom_css`. The engine renders them via `#theme-bg` and `#theme-pattern` at `z-index: -1` — above the canvas color, behind chat bubbles. Do NOT re-inject them via `body::before`/`body::after` in `custom_css` (old pattern from before the April 8 terminal-opacity fix — now obsolete and actively harmful: the old template prescribed `z-index: 0` which puts pattern in front of bubble text, hurting readability).

Adapt the reference patterns to fit the theme. Do NOT blindly copy — adjust opacity, blur, saturate values. Add decorative effects (glows, animated borders, text shadows) when they fit.

### Step 7: Validate Contrast

Run the contrast checker on the finished manifest:

```bash
node core/skills/theme-builder/scripts/check-contrast.cjs ~/.claude/destinclaude-themes/<slug>/manifest.json
```

If any HARD or SURFACE rules fail, fix the tokens and re-run. Soft warnings can be noted to the user but don't need fixing.

### Step 8: Confirm to User

Tell the user: "**[Theme Name]** is live in the app. What would you like to change?"

Delete the `_preview` folder if it exists: `rm -rf ~/.claude/destinclaude-themes/_preview`

---

## Phase 3 — In-App Refinement

After the theme pack is written, every refinement goes directly to manifest or asset files. The app hot-reloads automatically.

Common refinements:
- "More glassmorphism" → increase `background.panels-blur`, lower `panels-opacity`. For bubbles: adjust `bubble-blur`/`bubble-opacity`. These are manifest fields — do NOT hardcode in `custom_css`
- "Custom particles" → set `effects.particles: "custom"`, generate shape SVG, update `effects.particle-shape`
- "Different wallpaper" → download new, update `background.value`
- "More glow" → add/enhance `custom_css` effects

After any token change, re-run `check-contrast.cjs` to verify.

---

## Token Design Rules

### Surface Hierarchy

**Dark themes** (`dark: true`): `luminance(canvas) ≤ luminance(well) ≤ luminance(panel) ≤ luminance(inset)`
**Light themes** (`dark: false`): reverse order.

`panel` slightly different from `canvas`. `inset` slightly different from `panel`. `fg` through `fg-faint` form a descending contrast scale.

### Contrast Requirements

Run `scripts/check-contrast.cjs` to validate automatically. The rules:

**Hard (fail = broken UI):**
- `fg` on `canvas` — 4.5:1. Body text.
- `fg` on `inset` — 4.5:1. Assistant bubble text.
- `fg` on `panel` — 4.5:1. Header/status bar text.
- `on-accent` on `accent` — 4.5:1. User bubbles and active buttons.
- `fg-2` on `inset` — 3.5:1. Session pill labels, secondary bubble text.
- `fg-dim` on `inset` — 2.5:1. Tool card labels inside bubbles.

**Surface distinction (fail = elements disappear):**
- `inset` vs `panel` — 1.2:1 luminance. Session pills and toggle containers on header bar.
- `canvas` vs `inset` — 1.3:1 luminance. Code blocks inside assistant bubbles.
- `well` vs `panel` — 1.15:1 luminance. Search bar in command drawer.
- `edge` on `panel` — 1.5:1 contrast. Borders on panel surfaces (session strip, tool cards, chips).
- `edge-dim` on `panel` — 1.3:1 contrast. Dim borders (chips, code blocks rely entirely on these).

**Soft (warn only):**
- `fg-2` on `canvas` — 3.5:1. Secondary text.
- `fg-dim` on `panel` — 2.0:1. Inactive toggle text, dropdown labels.
- `accent` vs `inset` — 3.0:1. Active toggle should pop from container.
- `fg-muted` at 60% on `inset` — 2.0:1. Assistant bubble timestamps.
- `on-accent` at 50% on `accent` — 2.0:1. User bubble timestamps.

**Quick mental check:** Dark theme with canvas below `#1a1a1a` → fg above `#c0c0c0`. Light theme with canvas above `#e0e0e0` → fg below `#333333`.

### Palette Temperature Guidelines

| Vibe | Canvas | Accent | Notes |
|------|--------|--------|-------|
| Warm | `#1a1208`–`#2a1e10` | amber/gold | Cream/warm white fg |
| Cool | `#0a1018`–`#141e2a` | teal/cyan | Cool white fg |
| Neon | `#080810`–`#10101a` | hot magenta/cyan | Use glow effects |
| Pastel | `#f0e8f0`–`#faf0f4` (light) | medium pastels | Minimal effects |
| Earth | `#0a0f08`–`#1a1810` | moss/terracotta | Pattern overlays work well |
| Monochrome | Single hue family | Same hue at full sat | Add texture via patterns |

### Effect Intensity Defaults

| Effect | Typical Range | Too Low | Too High |
|--------|--------------|---------|----------|
| `particle-count` | 20–30 | <10 | >50 |
| `particle-speed` | 0.3–0.5 | <0.1 | >0.8 |
| `vignette` | 0.15–0.25 | <0.05 | >0.4 |
| `noise` | 0.02–0.05 | <0.01 | >0.1 |
| `panels-blur` | 12–20px | <6 | >30 |
| `panels-opacity` | 0.70–0.85 | <0.5 | >0.95 |
| `pattern-opacity` | 0.04–0.08 | <0.02 | >0.15 |

### Dark vs. Light Mode

- **Usually dark:** cyberpunk, neon, midnight, space, ocean depths, noir
- **Usually light:** pastel, kawaii, cottagecore, minimal, paper, summer
- **Could go either way:** autumn, forest, vintage, retro, steampunk

When ambiguous, include at least one dark and one light concept among the 3 initial options.

### Exemplar Theme Reference

For a complete, production-quality manifest, read:
```
destincode/desktop/src/renderer/themes/community/golden-sunbreak/manifest.json
```
Only consult this when unsure about value calibration — not on every run.

---

## Layout Preset Reference

`chrome-style: "floating"` elevates ALL chrome bars — header, input, status — into detached rounded cards. Individual `*-style` keys override per element. The bottom chrome order is: **status bar above input bar**.

Never use `position: absolute` on layout-flow elements in `custom_css` — the floating aesthetic uses `align-self`, `width: fit-content`, `margin`, `border-radius`, `box-shadow`.

`bubble-style: "pill"` uses `radius-2xl` (NOT `radius-full`) — avoids destructive semicircular caps on multi-line content.

---

## Rules

- NEVER modify files in `src/renderer/themes/builtin/` or write to any path inside the app bundle
- All asset paths in manifest.json MUST be relative
- Use `custom_css` for effects the schema doesn't cover
- NEVER set `border-radius` on bubble elements in `custom_css` — use `bubble-style` preset and `shape` values
- Pattern SVGs must tile seamlessly
- Particle shapes should work at 8-16px
- When generating mascots, ALWAYS read the base templates first for silhouette/proportions, but follow the **Mascot rendering rules** (white body + currentColor stroke, features drawn on top, not cutouts). The base templates' currentColor-fill + cutout-eye pattern fails on most themes.
- The preview CSS (`theme-preview.css`) and the app's `globals.css` are a CONTRACT — if either changes, both must stay in sync
- NEVER write the concepts page HTML from scratch — always read `scripts/concept-page-template.html` first and fill in the placeholders. The template owns the page shell, script wiring, and click events.
- NEVER write the Kit page HTML from scratch — copy `scripts/kit-refinement-template.html` to `screen_dir/screen.html` and fill in the placeholders. The template loads `kit-presets.json` and renders preset cards at runtime — do not inline preset cards.

### Phase Checklists

**Before rendering concepts (Phase 1):**
- [ ] `scripts/concept-page-template.html`, `scripts/app-mockup-chrome.html`, and `scripts/manifest-template.jsonc` have been read (manifest in Phase 1, not deferred)
- [ ] Each `.app-mockup` uses `data-mockup` + data-* placeholders — NO inlined chrome HTML, NO hand-drawn icons (`mockup-render.js` injects the canonical chrome at runtime)
- [ ] Concepts differ on ≥ 2 of {palette family, layout preset, font character, bubble shape, primary effect} — not 3 palettes of the same theme
- [ ] All asset references use `/files/` prefix
- [ ] CSS linked, not inlined
- [ ] Glassmorphism mockups set all four glass vars: `--panels-blur`, `--panels-opacity`, `--bubble-blur`, `--bubble-opacity`
- [ ] Wallpaper concepts: `--panels-opacity` is ≤ 0.85 so the wallpaper actually bleeds through the chrome bars
- [ ] Concept palette has been piped through `check-contrast.cjs --tokens-json -` — passes all HARD rules before the HTML is written
- [ ] `on-accent` passes 4.5:1 against `accent`

**Before rendering Kit (Phase 1.5):**
- [ ] Concept pick has been seeded into `_preview/manifest.json` (tokens + shape + layout + font + effects)
- [ ] Baseline assets generated into BOTH `_preview/assets/` AND `screen_dir`: wallpaper, mascots (if applicable), icons (if applicable), pattern (if applicable)
- [ ] `kit-refinement-template.html` copied to `screen_dir/screen.html` and `kit-presets.json` copied to `screen_dir/kit-presets.json`
- [ ] Placeholders filled: THEME_NAME, GOOGLE_FONTS, CURRENT_MOCKUP, every column's `data-current` + current name/blurb, review columns' asset preview tiles
- [ ] Columns with no corresponding assets (no mascot, no icons, etc.) are hidden with `data-hidden="true"`
- [ ] Preset cards NOT inlined — the page renders them from kit-presets.json at load time

**When processing kit-submit (Phase 1.5 rebuild):**
- [ ] Only columns with `action !== "keep"` are regenerated — don't reprocess unchanged columns
- [ ] Palette overrides piped through `check-contrast.cjs --tokens-json -` before applying
- [ ] Updated assets mirrored into BOTH `_preview/assets/` AND `screen_dir`
- [ ] `screen.html` rewritten with new `data-current` attrs — file-watcher auto-reloads the page

**Before finalizing theme pack (Phase 2):**
- [ ] Intent from latest kit-submit is `"build"` — user explicitly asked to ship
- [ ] `scripts/manifest-template.jsonc` has been read before writing manifest.json
- [ ] `scripts/custom-css-reference.md` has been read before writing custom CSS
- [ ] Assets moved from `_preview/assets/` → `<slug>/assets/`; wallpaper also still in `screen_dir`
- [ ] For image themes: `wallpaper-terminal.webp` baked via `prep-terminal-bg.cjs` AND manifest includes `background.terminal-value`
- [ ] If mascots were regenerated during Kit, they already follow the Mascot rendering rules (white body + currentColor stroke; features drawn on top, not cutouts; verified distinct at 24 px)
- [ ] Manifest uses relative asset paths only
- [ ] Bubble blur/opacity are manifest fields, NOT hardcoded in `custom_css`
- [ ] Wallpaper + pattern come from `background.value` / `background.pattern` manifest fields — NOT from `body::before`/`body::after` in `custom_css`
- [ ] `check-contrast.cjs` passes with no HARD or SURFACE failures
- [ ] `_preview/` deleted after successful pack creation
