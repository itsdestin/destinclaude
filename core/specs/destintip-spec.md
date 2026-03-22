# DestinTip — Spec

**Version:** 1.2
**Last updated:** 2026-03-20
**Feature location:** `core/hooks/session-start.sh` (injection logic), `core/data/destintip-catalog.json` (tip catalog), `~/.claude/toolkit-state/destintip-state.json` (per-user state)

## Purpose

An adaptive toolkit hint system that helps DestinClaude users discover features they haven't used yet. Tips are curated per session based on the user's comfort level, usage history, and a rotation algorithm, then injected into Claude's system prompt via the existing SessionStart hook. Claude weaves tips naturally into conversation when contextually relevant.

Inspired by the `★ Insight` output style plugins (Anthropic's `explanatory-output-style` and `learning-output-style` marketplace plugins), which inject behavioral instructions via `SessionStart` → `additionalContext`. DestinTip follows the same mechanism but with dynamic, state-aware tip selection instead of static instructions.

## User Mandates

- Tips must use the `★ DestinTip` branding with backtick inline-code formatting (renders as purple in Claude Code's terminal)
- Maximum 1 tip per Claude response — never overwhelm the user
- Tips must feel like helpful discovery, never prescriptive ("you should be doing this")
- The system must adapt: new users get onboarding-level hints, experienced users get deeper feature discovery

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Integrated into DestinClaude core layer, not a standalone plugin | Needs native access to `config.json` (comfort level), toolkit state, and the existing `session-start.sh` lifecycle. Standalone plugin would require duplicating state reads and couldn't subsume the `/toolkit` reminder. | Standalone plugin (rejected: no access to toolkit state, users install separately), optional layer (rejected: over-isolation for a lightweight feature) |
| Single JSON catalog file (`core/data/destintip-catalog.json`) | Centralized curation of all tips with per-tip metadata. Easy to review, edit, and contribute to. The catalog is small (~20 entries) so a single file stays manageable. | Hardcoded in prompt string (rejected: can't filter/rotate), distributed in SKILL.md files (rejected: requires globbing, fragile convention, hard to curate quality) |
| Prompt injection via `additionalContext` (Approach C) | Proven pattern from Anthropic's Insight plugins. Session-level rotation with usage-aware selection provides 90% of contextual value without runtime hook complexity. | Pure static prompt (rejected: no adaptation), runtime PostToolUse hooks for real-time detection (rejected: fragile pattern matching, adds latency, high maintenance) |
| 4 tips selected per session | Enough variety to cover different conversation directions; small enough to keep token cost low (~300-500 tokens). | All tips (rejected: bloats prompt, no rotation), 1-2 tips (rejected: too narrow, misses conversational variety) |
| Discovery model: shown 3+ times = discovered | Avoids instrumenting every skill/command invocation. Simple, stateless heuristic — if Claude has told you about a feature three times across sessions, you're aware it exists. | Actual invocation tracking (rejected: requires hooks on every command, complex), session-count heuristic only (rejected: too coarse, doesn't account for which features) |
| Subsumes the existing `/toolkit` reminder (lines 337-359 of session-start.sh) | DestinTip provides strictly more value — curated, relevant tips every session vs. a blunt "Type /toolkit" every 20 sessions. Removes `toolkit-reminder.json` state file. | Keep both (rejected: redundant, two systems nudging about features) |
| 5-session cooldown before re-showing a tip | Prevents the same tip from appearing in consecutive sessions. Long enough to feel fresh, short enough that important undiscovered features resurface. | No cooldown (rejected: repetitive), per-tip "never show again" (rejected: user might need a reminder after forgetting) |
| Node.js for selection logic inside session-start.sh | Consistent with existing session-start.sh patterns which already use `node -e` extensively for JSON parsing. Keeps the selection algorithm in one inline script. | External Node script (rejected: one more file for a ~30-line algorithm), pure bash (rejected: JSON manipulation in bash is fragile) |
| Backtick inline-code formatting (no ANSI color) | LLM text output cannot emit raw ANSI escape bytes — Claude outputs literal characters like `\033`, not the ESC byte (0x1B). Backtick inline code is the only reliable formatting available via `additionalContext` prompt injection. Renders as purple in Claude Code's Ink-based terminal. | ANSI yellow `\033[33m` (rejected: LLM cannot emit escape bytes, literal `\033` appears as text), no formatting (rejected: tips blend into response text) |
| Output via stdout JSON with nested `hookSpecificOutput` format | Matches the exact pattern used by Anthropic's Insight plugins: `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`. Output to stdout, not stderr (stderr is for plain `hookSpecificOutput` string messages). | Plain `hookSpecificOutput` string on stderr (rejected: doesn't support `additionalContext` injection into system prompt) |
| Comfort level values match config.json exactly: `beginner`, `intermediate`, `power_user` | The setup wizard stores these values in `config.json`. Using the same strings avoids a mapping layer and prevents silent mismatches. | Custom labels like `balanced`/`full` (rejected: requires mapping, risks silent filtering failures when values don't match) |
| Tie-breaking by catalog order | When multiple tips share the same score, tips appearing earlier in the catalog are selected first. This gives catalog authors implicit priority control — place more important tips higher. | Random (rejected: non-deterministic, harder to debug), alphabetical by ID (rejected: arbitrary, no semantic meaning) |

## Current Implementation

### Architecture

```
Session Start
    │
    ├─ Read config.json ──→ comfort_level (default: "intermediate" if missing)
    ├─ Read destintip-state.json ──→ discovered_features[], shown_tips{}, session_count
    │   (auto-create with defaults if missing)
    ├─ Read destintip-catalog.json ──→ all tips[]
    │
    ├─ Increment session_count
    │
    ├─ Filter tips:
    │   ├─ comfort_levels includes user's level
    │   ├─ requires_discovered ⊆ discovered_features
    │   └─ not shown in last 5 sessions (session_count - last_shown_session > 5)
    │
    ├─ Score remaining tips (stable sort preserves catalog order for ties):
    │   ├─ Feature undiscovered → +10
    │   ├─ Never shown before → +5
    │   └─ Sessions since last shown → +1 each (session_count - last_shown_session)
    │
    ├─ Select top 4 by score (or fewer if <4 tips survive filtering)
    │
    ├─ Update shown_tips (increment times_shown, set last_shown_session)
    ├─ Update discovered_features (any tip with times_shown >= 3 → feature discovered)
    ├─ Write destintip-state.json
    │
    ├─ If 0 tips selected: skip output entirely (no additionalContext injected)
    │
    └─ Output to stdout:
        {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
        containing:
        ├─ ★ DestinTip format instructions
        ├─ User's comfort level + tone guidance
        └─ Selected tips with context_hints
```

### Tip Catalog Schema

File: `core/data/destintip-catalog.json` (directory created if needed: `mkdir -p core/data/`)

```json
{
  "tips": [
    {
      "id": "string — unique identifier (kebab-case)",
      "feature": "string — skill or command name this tip relates to",
      "category": "string — layer: core | life | productivity",
      "comfort_levels": ["beginner", "intermediate", "power_user"],
      "requires_discovered": ["feature-id", "..."],
      "text": "string — the tip shown to the user (1-2 sentences)",
      "context_hint": "string — instruction to Claude about when to surface this tip"
    }
  ]
}
```

### State File Schema

File: `~/.claude/toolkit-state/destintip-state.json` (auto-created on first session with these defaults)

```json
{
  "session_count": 0,
  "discovered_features": [],
  "shown_tips": {}
}
```

Each entry in `shown_tips` is keyed by tip ID:
```json
{
  "times_shown": 0,
  "last_shown_session": 0
}
```

### Output Format

The hook outputs a single JSON object to **stdout** (not stderr):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "...escaped prompt string..."
  }
}
```

This matches the exact format used by Anthropic's `explanatory-output-style` and `learning-output-style` marketplace plugins. The `additionalContext` string is injected into Claude's system prompt as a `<system-reminder>` for the entire session.

Note on escaping: The `additionalContext` value is a JSON string. Backticks, newlines, and quotes within the prompt template must be properly escaped (`\n`, `\"`, backticks are safe in JSON strings). The inline Node.js script handles this via `JSON.stringify()`.

### Injected Prompt Template

The `additionalContext` string assembled by the selection algorithm:

```
You have the DestinTip system active. Throughout this session, naturally weave
toolkit hints into your responses when relevant. Use this exact format (with backticks):

"`★ DestinTip ────────────────────────────────────`
[tip content here]
`──────────────────────────────────────────────────`"

Rules:
- Maximum 1 tip per response — don't overwhelm the user
- Only surface a tip when it's genuinely relevant to what the user is doing
- If nothing is relevant, don't force a tip — silence is fine
- Keep tips conversational and brief (1-2 sentences)
- Frame tips as helpful discovery, never prescriptive

The user's comfort level is: {comfort_level}
- beginner: Focus on basic features, explain what things do
- intermediate: Assume familiarity with basics, highlight deeper features
- power_user: Power-user tips, feature combinations, advanced workflows

Tips available this session:

1. {tip.text}
   When to suggest: {tip.context_hint}

2. ...
(however many tips were selected, up to 4)
```

### Integration Points

- **session-start.sh**: New `# --- DestinTip selection ---` section added after the inbox check, before `exit 0`. Replaces the existing `# --- Periodic /toolkit reminder ---` section that occupied this same position. Preceded by a `rm -f` cleanup of the subsumed `toolkit-reminder.json`.
- **config.json**: Reads existing `comfort_level` field. No schema changes. If `comfort_level` is missing (e.g., restored from pre-comfort-gate backup), defaults to `"intermediate"` — consistent with the setup wizard's own fallback behavior (SKILL.md line 233).
- **toolkit-state/**: New `destintip-state.json` file at `~/.claude/toolkit-state/destintip-state.json`. `toolkit-reminder.json` removed (subsumed).
- **Setup wizard**: No changes needed. Comfort level is already captured.

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| First session (no state file) | Auto-create `destintip-state.json` with defaults. All beginner-eligible tips are candidates. |
| `comfort_level` missing from config | Default to `"intermediate"` |
| Fewer than 4 tips survive filtering | Select however many survived (1, 2, or 3). Inject those. |
| Zero tips survive filtering | Skip `additionalContext` output entirely. No DestinTip instructions injected. |
| `node` not available | Skip DestinTip entirely (consistent with other Node-dependent sections in session-start.sh). |
| Catalog file missing | Skip DestinTip entirely. Log warning to stderr: `{"hookSpecificOutput": "Warning: DestinTip catalog not found."}` |

### Files

| File | Action | Purpose |
|------|--------|---------|
| `core/data/destintip-catalog.json` | Create (with `mkdir -p core/data/`) | Tip catalog with ~15-20 entries covering all layers |
| `core/hooks/session-start.sh` | Modify | Add selection logic section, remove `/toolkit` reminder section |
| `~/.claude/toolkit-state/destintip-state.json` | Auto-created at runtime | Per-user tip state (not checked into repo) |
| `~/.claude/toolkit-state/toolkit-reminder.json` | Remove at runtime | Subsumed by DestinTip |

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-20 | Initial spec |
| 1.2 | 2026-03-21 | Removed ANSI color — LLM text output cannot emit escape bytes. Updated to backtick inline-code formatting (purple in Claude Code). Updated User Mandate, Design Decision, and prompt template to match implementation. |
| 1.1 | 2026-03-20 | Fixed comfort level values to match config.json (`intermediate`/`power_user` not `balanced`/`full`). Documented exact JSON output format for `additionalContext` injection. Added `comfort_level` fallback to `"intermediate"`. Clarified state file path as `~/.claude/toolkit-state/`. Added edge cases table. Defined tie-breaking (catalog order). Made `session_count` increment explicit. Added `core/data/` directory creation note. Added escaping note for JSON string assembly. |
