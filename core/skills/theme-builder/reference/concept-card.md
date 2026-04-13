# Concept Card Structure

Read this file before generating the 3 concept cards in Phase 1. It documents the `.concept-card` shape, the `.app-mockup` data-attribute contract, and glassmorphism var conventions.

## Per-card structure

Each concept is a `.concept-card` div with `data-choice="A"` (or B, C). Set all CSS tokens as inline `style="--canvas: #HEX; ..."` on the scoping div. Inside each card:

1. **Theme name** (`<h2>`) and **one-sentence vibe** (`<p>`)
2. **Swatch row** — 5 color swatches (canvas, panel, inset, accent, fg)
3. **Vibe tags** — `.concept-label` spans listing planned features (e.g. "floating input", "glassmorphism")
4. **App mockup** — see below.

## App mockup (data-attribute contract)

**Do NOT inline chrome HTML.** The concept-page-template loads `scripts/mockup-render.js`, which scans the page for `[data-mockup]` elements and injects the canonical chrome — settings gear, session pill, chat/terminal toggle, attach/compass/send icons, model/permission/usage chips — from a central template.

Concepts author only the outer div and its data attributes:

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

For reference, the full chrome template mockup-render injects lives at `scripts/app-mockup-chrome.html` (structural spec) and inside `scripts/mockup-render.js` (runtime source). You rarely need to open either — just set the data attributes above.

## CSS conventions

Use the exact CSS classes from `theme-preview.css`. All colors from CSS custom properties — never hardcode hex in element styles except on the scoping `.concept-card` div.

## Wallpaper compositing

Mirrors the real app: `#theme-bg` paints the wallpaper across the whole mockup box, `.chat-area` is transparent, and chrome bars (header/input/status) sit on top as `color-mix()` + `backdrop-filter` glass. Don't add a background to `.chat-area` or give chrome bars a fully opaque `--panels-opacity` — either will hide the wallpaper. To preview the wallpaper clearly, keep `--panels-opacity` in the 0.55–0.85 range when a wallpaper is set.

## Identical send arrow

The send button SVG path is `M5 12h14M12 5l7 7-7 7` — used everywhere. Any concept that substitutes ▶ / → / ▲ or a custom shape is wrong and will be rejected at review.

## Glassmorphism vars

Set on the `.app-mockup` wrapper: `style="--panels-blur: Npx; --panels-opacity: N; --bubble-blur: Npx; --bubble-opacity: N;"`. `theme-preview.css` applies glass unconditionally via `color-mix()` + `backdrop-filter`, so you don't need any attribute gate. At defaults (`0px` / `1`) rules are a visual no-op.
