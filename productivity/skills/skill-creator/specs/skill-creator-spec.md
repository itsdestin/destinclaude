# Skill Creator — Spec

**Version:** 1.0
**Last updated:** 2026-03-13
**Feature location:** `~/.claude/skills/skill-creator/`

## Purpose

The Skill Creator is a meta-skill that enables Claude to build, test, iterate on, and optimize other skills. It provides a structured workflow that takes a user from initial idea through an interview process, skill drafting, automated evaluation with parallel baseline comparison, human-in-the-loop review via a browser-based viewer, iterative improvement, description optimization for triggering accuracy, and final packaging. It is designed to work across Claude Code, Claude.ai, and Cowork environments with graceful degradation of features (e.g., no subagents or browser in some contexts).

## User Mandates

- (2026-03-13) Skill descriptions should be written "pushy" to combat Claude's tendency to under-trigger skills — include explicit contexts and near-miss phrasings in the description field.
- (2026-03-13) Always generate the eval viewer (`generate_review.py`) and show it to the human BEFORE making your own corrections to the skill. Human review comes first.
- (2026-03-13) Communication should be calibrated to the user's technical level — avoid jargon like "JSON" and "assertion" unless context cues confirm familiarity.
- (2026-03-13) When improving a skill, generalize from feedback rather than overfitting to specific test cases. Explain the "why" behind instructions instead of using heavy-handed ALWAYS/NEVER directives.
- (2026-03-13) Skills must not contain malware, exploit code, or anything that would surprise the user if the skill's intent were described (Principle of Lack of Surprise).
- (2026-03-13) Encyclopedia and modular files must never be written to Google Drive without Destin's explicit approval of the specific changes (global mandate from CLAUDE.md).

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Parallel with-skill + baseline runs | Launching both simultaneously saves wall-clock time and ensures fair comparison under similar conditions | Sequential runs (slower, timing drift); skill-only runs (no comparison baseline) |
| Browser-based eval viewer (`generate_review.py`) | Rich inline rendering of outputs, side-by-side comparison, and persistent feedback collection via `feedback.json` | In-conversation review (loses visual fidelity); custom HTML per eval (inconsistent, more work) |
| Three-level progressive disclosure (metadata → SKILL.md → bundled resources) | Keeps context window lean — only ~100 words always loaded; full body on trigger; large references on demand | Flat single-file (context bloat); fully lazy loading (slower triggering decisions) |
| Description optimization via `run_loop.py` with train/test split | 60/40 split prevents overfitting the description to the eval set; 3x runs per query smooth out stochastic variance | Manual description tuning (slow, subjective); no split (overfits to training queries) |
| Workspace organized by iteration (`iteration-N/eval-ID/`) | Clean separation lets the viewer show diffs across iterations and preserves full history | Overwriting in place (loses history); flat structure (hard to compare) |
| Subagent grading with `agents/grader.md` | Independent grading avoids bias from the agent that wrote the skill; programmatic assertions where possible for reliability | Self-grading (biased); purely manual grading (slow, doesn't scale) |
| `--static` flag for headless/Cowork environments | Generates standalone HTML when no browser/display is available; feedback downloaded as file | Skip review entirely (loses human signal); text-only review (loses visual fidelity) |

## Current Implementation

### Directory Structure

```
skill-creator/
├── SKILL.md              — Main skill instructions (486 lines)
├── LICENSE.txt
├── agents/
│   ├── grader.md          — Assertion evaluation instructions for subagents
│   ├── comparator.md      — Blind A/B comparison protocol
│   └── analyzer.md        — Benchmark analysis and pattern detection
├── assets/
│   └── eval_review.html   — Template for description-optimization eval review UI
├── eval-viewer/
│   ├── generate_review.py — Generates browser-based output review + benchmark viewer
│   └── viewer.html        — HTML template for the review viewer
├── references/
│   └── schemas.md         — JSON schemas for evals.json, grading.json, benchmark.json
├── scripts/
│   ├── __init__.py
│   ├── aggregate_benchmark.py — Aggregates grading results into benchmark.json/md
│   ├── generate_report.py     — Report generation utilities
│   ├── improve_description.py — Proposes improved skill descriptions via Claude
│   ├── package_skill.py       — Packages a skill directory into a .skill file
│   ├── quick_validate.py      — Fast validation checks
│   ├── run_eval.py            — Runs trigger evaluation for a single description
│   ├── run_loop.py            — Full description optimization loop (train/test split, iterations)
│   └── utils.py               — Shared utilities
└── specs/
    └── spec.md            — This file
```

### Skill Creation Workflow

1. **Capture Intent** — Understand what the skill should do, when it should trigger, expected output format, and whether test cases are appropriate. Can extract intent from an existing conversation if the user says "turn this into a skill."

2. **Interview and Research** — Proactively ask about edge cases, input/output formats, example files, success criteria, and dependencies. Check available MCPs for research. Wait to write test prompts until this phase is complete.

3. **Write SKILL.md** — Produce the skill file with YAML frontmatter (`name`, `description`) and markdown body. Follow progressive disclosure: keep SKILL.md under 500 lines, use `references/` for large docs, organize by domain variant when applicable. Description should be "pushy" to improve trigger rates.

4. **Write Test Cases** — Draft 2-3 realistic test prompts, save to `evals/evals.json`, and confirm with the user before running.

### Eval and Benchmark System

5. **Spawn Runs** — For each test case, launch two parallel subagents: one with the skill, one baseline (no skill for new skills; old version for improvements). Results saved to `<skill-name>-workspace/iteration-N/eval-ID/{with_skill,without_skill}/outputs/`. Write `eval_metadata.json` per eval.

6. **Draft Assertions** — While runs execute, draft quantitative assertions with descriptive names. Update `eval_metadata.json` and `evals/evals.json`. Assertions should be objectively verifiable; subjective qualities are left to human review.

7. **Capture Timing** — When subagent notifications arrive, immediately save `timing.json` (total_tokens, duration_ms) — this data is ephemeral and only available at notification time.

8. **Grade** — Subagent reads `agents/grader.md` and evaluates each assertion against outputs, writing `grading.json` (fields: `text`, `passed`, `evidence`). Programmatic scripts preferred over eyeballing where possible.

9. **Aggregate Benchmark** — Run `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>` to produce `benchmark.json` and `benchmark.md` with pass_rate, time, and tokens (mean +/- stddev + delta).

10. **Analyst Pass** — Surface patterns hidden by aggregate stats: non-discriminating assertions, high-variance evals, time/token tradeoffs (per `agents/analyzer.md`).

11. **Launch Viewer** — Run `generate_review.py` with `--benchmark benchmark.json` (and `--previous-workspace` for iteration 2+). The viewer has two tabs: "Outputs" (per-case review with feedback textboxes) and "Benchmark" (quantitative comparison). Use `--static` for headless environments.

12. **Collect Feedback** — User reviews outputs and submits via "Submit All Reviews," producing `feedback.json`. Empty feedback = satisfied.

### Iteration Loop

13. **Improve Skill** — Generalize from feedback (avoid overfitting), keep the prompt lean, explain the "why," and look for repeated work across test cases that should become bundled scripts.

14. **Re-run** — Apply improvements, run all test cases into `iteration-N+1/`, launch viewer with `--previous-workspace`, collect feedback. Repeat until satisfied.

### Description Optimization

15. **Generate Trigger Evals** — Create 20 realistic queries (8-10 should-trigger, 8-10 should-not-trigger) focusing on edge cases and near-misses rather than obvious matches/non-matches.

16. **User Review** — Present via `assets/eval_review.html` template; user can edit, toggle, add/remove entries, then export.

17. **Optimization Loop** — Run `python -m scripts.run_loop` with the eval set. Automatically splits 60/40 train/test, evaluates 3x per query, iterates up to 5 times, selects best description by test score.

18. **Apply Result** — Update SKILL.md frontmatter with `best_description`, show before/after and scores to user.

### Packaging

19. **Package** — Run `python -m scripts.package_skill <skill-folder>` to produce a `.skill` file for distribution (only if `present_files` tool is available).

### Environment Adaptations

- **Claude Code**: Full feature set — subagents, browser viewer, description optimization.
- **Claude.ai**: No subagents (run test cases sequentially, skip baselines), no browser viewer (present results inline), skip description optimization and blind comparison.
- **Cowork**: Subagents available but no display — use `--static` for viewer output, feedback downloaded as file.

## Dependencies

- **Depends on:** Python 3 (for all scripts), `claude` CLI (`claude -p` for description optimization), subagent capability (for parallel test runs, grading, blind comparison — gracefully degrades without), browser/display (for viewer — falls back to `--static` HTML or inline presentation).
- **Depended on by:** All other skills benefit from this skill during their creation and iteration lifecycle. Referenced in CLAUDE.md skill table. The `encyclopedia-update`, `encyclopedia-compile`, `journaling-assistant`, `encyclopedia-librarian`, `jlbc-fiscal-note`, `google-drive`, `destins-writing-voice`, and `elections-notebook` skills were (or can be) developed and refined through this workflow.

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-13 | 1.0 | Initial spec | New | Destin |
