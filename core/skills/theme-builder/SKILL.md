---
name: theme-builder
description: Build immersive DestinCode theme packs. Invoke as /theme-builder "your vibe description". Users can start from a general vibe, a specific detailed brief, or by uploading their own wallpaper. Two-phase — concept browser first, then full theme pack generation with assets.
---

# /theme-builder

Build a custom DestinCode theme pack. Three starting modes:

- **General vibe** — a short prompt like "cozy autumn", "cyberpunk", or "Hello Kitty". Claude designs the look from scratch.
- **Specific detailed description** — a longer brief covering palette, fonts, layout, mood, references. Claude follows it precisely.
- **Upload your own wallpaper** — the user drops in an image and Claude builds the theme around it.

Claude generates concept options in a browser window first — no app changes — then builds a complete theme pack (folder with manifest + assets). The app hot-reloads from the folder.

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

Tell the user the URL and ask them to look while iterating in chat.

**Quick-apply is default.** When the user selects a concept, immediately write a minimal manifest to `_preview`:

```bash
mkdir -p ~/.claude/destinclaude-themes/_preview
```

Write `manifest.json` with **only** tokens, shape, layout, effects, and font — no asset paths. The app auto-switches to `_preview` and auto-reverts when deleted. This lets the user see the theme live while deciding.

- Never include asset paths in preview — they don't exist yet
- Delete `_preview` when done: `rm -rf ~/.claude/destinclaude-themes/_preview`

### Step 5b: Layout Gallery (opt-in)

If the user expresses layout confusion ("I like B's colors but A's layout"), serve the pre-built layout gallery:

```bash
cp "${screen_dir}/layout-gallery.html" "${screen_dir}/screen.html"
```

This shows 4 layout templates (Classic, Floating, Minimal, Terminal) with neutral colors so the user evaluates layout shape independently of palette. After they pick, regenerate concepts with their chosen layout.

### Step 6: Iterate

User requests changes → re-render in the browser. Proceed to Phase 2 when they say "build it", "apply it", "go", or similar.

---

## Phase 2 — Theme Pack Generation

### Phase 2a: Visual Refinement (consolidated single page)

**Before generating any assets, read the refinement page template:**

```
scripts/screen-refinement-template.html
```

Do NOT write the refinement page from scratch — read the template, then fill in the three section placeholders. After the user approves a concept direction, generate all visual assets and render them into the template sections:

**Section 1: Background & Atmosphere** (`<!-- BACKGROUND_CONTENT -->`)
- Full-width wallpaper preview (download wallpaper first, copy to `screen_dir`, reference as `/files/wallpaper.<ext>`)
- Pattern tile preview if applicable
- Glass sample panel overlaid on wallpaper (showing blur + opacity)
- Particle effect label badge

**Section 2: Mascot Crossovers** (`<!-- MASCOT_CONTENT -->`)
- All 3 mascot variants at 120x120px using `.ref-mascot-grid` layout
- Hide this section (`data-hidden="true"`) if theme has no mascot crossovers

**Section 3: Icons & Details** (`<!-- ICONS_CONTENT -->`)
- Icon overrides at 48x48px using `.ref-icon-grid` layout
- Cursor SVG at 64x64px if applicable
- Scrollbar strip mock, `::selection` preview block
- Hide this section if no icons/cursor/scrollbar

Set the theme name in `<!-- THEME_NAME -->` and write the completed page to `screen_dir`.

**How it works:** Each section has "Looks good" (default) and "Request changes" toggles. The user reviews all sections, types notes where needed, and clicks "Build Theme Pack". The companion sends a `refinement-submit` WebSocket event with structured approval data. Claude processes: approved sections are done, changed sections get regenerated and the page re-renders. Iterate until all approved, then proceed.

### Step 1: Create the Theme Pack Folder

```bash
mkdir -p ~/.claude/destinclaude-themes/<slug>/assets
```

### Step 2: Download the Hero Wallpaper

- **User-provided wallpaper:** copy directly to `<slug>/assets/wallpaper.<ext>` and `screen_dir`. Skip web search entirely.
- **Brand/IP Mode:** WebSearch for official/fan art → WebFetch → save to assets + `screen_dir`. Prefer 1920x1080+.
- **Vibe/Abstract Mode:** WebSearch stock photos (Unsplash, Pexels) → WebFetch → save. Or use CSS gradient if no wallpaper needed.

### Step 3: Generate SVG Assets

Write each SVG to the assets folder. Guidelines:
- **Pattern SVG** (`assets/pattern.svg`): Single seamlessly tiling tile, viewBox ~`0 0 40 40`, single fill color
- **Particle Shape SVG** (`assets/<name>.svg`): Single centered shape, simple enough for 8-16px render
- **Icon SVGs** (`assets/icon-<slot>.svg`): 24x24 viewBox, use `currentColor`. Slots: send, new-chat, settings, theme-cycle, close, menu
- **Cursor SVG** (`assets/cursor.svg`): 32x32 viewBox, hotspot at top-left. Only if it genuinely fits.
- **Scrollbar SVG** (`assets/scrollbar-thumb.svg`): Vertical, subtle.

### Step 4: Generate Mascot Crossovers

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
- `body::after` pattern overlay (when theme has a pattern)
- Glassmorphism block (when `panels-blur > 0`)

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

**Before writing theme pack (Phase 2):**
- [ ] `scripts/screen-refinement-template.html` has been read and will be used as the page shell
- [ ] `scripts/manifest-template.jsonc` has been read before writing manifest.json
- [ ] `scripts/custom-css-reference.md` has been read before writing custom CSS
- [ ] Wallpaper copied to BOTH `<slug>/assets/` AND `screen_dir`
- [ ] Read base mascot SVGs before generating crossovers, AND follow the Mascot rendering rules (white body + currentColor stroke; features drawn on top, not cutouts; verified distinct at 24 px)
- [ ] Manifest uses relative asset paths only
- [ ] Bubble blur/opacity are manifest fields, NOT hardcoded in `custom_css`
- [ ] `body::after` (not `::before`) for pattern overlay
- [ ] `check-contrast.cjs` passes with no HARD or SURFACE failures
