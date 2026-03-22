# Fork File Skill — Spec

**Version:** 1.0
**Last updated:** 2026-03-18
**Feature location:** `life/skills/fork-file/`
**Original author:** [@tjmorin03](https://github.com/tjmorin03)

## Purpose

A food tracking skill with two components: grocery/pantry inventory management across user-defined storage locations, and fast food spending tracking by restaurant, item, and size. Supports receipt photo processing via messaging MCP servers, food photo identification, manual entry, inventory queries, freshness tracking, and cross-component spending summaries.

## User Mandates

- (2026-03-18) Never write to CSV files or `locations.txt` without explicit user approval. Always present a review table first.
- (2026-03-18) Storage locations must be user-configured, not hardcoded. The `locations.txt` file is the source of truth.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| User-configured locations via `locations.txt` | Users have wildly different living situations (dorm room, apartment, house with garage, multiple kitchens). Hardcoded locations break for anyone who doesn't match the author's setup. | Hardcoded location set (rejected: not portable), free-text locations with no file (rejected: no consistency across sessions) |
| Platform-agnostic messaging with auto-detection | The toolkit supports both `imessages` (macOS) and `gmessages` (all platforms). The skill should work with whichever server is configured rather than hardcoding one. | Hardcode `imessages` only (rejected: breaks on Windows/Linux), require user to specify (rejected: unnecessary friction) |
| Two separate CSV files (pantry + fast food) | Grocery inventory and fast food logs have fundamentally different schemas — inventory has location/quantity/expiration, fast food has restaurant/size. Combining them would require many empty columns. | Single CSV with type column (rejected: sparse columns, confusing), SQLite database (rejected: over-engineered, harder to inspect manually) |
| `~/.claude/fork-file/` data directory | Follows the toolkit pattern of keeping skill data under `~/.claude/`. Files are plain CSV — easy to edit, back up, or inspect outside Claude. | Skill-relative directory (rejected: wouldn't persist across installs), XDG data dirs (rejected: inconsistent across platforms) |
| Self-bootstrapping on first run | The skill checks for its data directory and CSV headers before every operation and creates them if missing. This eliminates a separate install step. | Require setup wizard integration (rejected: adds coupling, delays availability), fail with error message (rejected: bad UX) |
| Approval-before-write pattern | Matches the convention established by other DestinClaude skills (journaling, encyclopedia). Users must see exactly what will be written and confirm. | Auto-write with undo (rejected: inconsistent with toolkit conventions, higher risk of bad data) |

## Data Files

| File | Purpose | Format |
|------|---------|--------|
| `~/.claude/fork-file/pantry.csv` | Grocery inventory | CSV: `item,category,location,quantity,price,date_added,expiration,notes` |
| `~/.claude/fork-file/fastfood.csv` | Fast food spending log | CSV: `date,restaurant,item,size,price,notes` |
| `~/.claude/fork-file/locations.txt` | User-defined storage locations | One location per line, lowercase with underscores |

## Dependencies

- **Required:** DestinClaude core layer
- **Optional:** `imessages` MCP server (macOS) or `gmessages` MCP server (all platforms) — needed for receipt/photo processing via text messages. Without either, only manual entry operations are available.

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-18 | Initial spec. Depersonalized locations, added bootstrapping, platform-agnostic messaging, spec created. Based on PR #3 by @tjmorin03. |
