# Specs Index

All feature specifications. Skill specs live in their skill folder; system specs live here.

| Feature | Type | Spec Location | Version |
|---------|------|--------------|---------|
| Specs System | system | specs/specs-system-spec.md | 3.2 |
| YouCoded Toolkit | system | specs/youcoded-core-spec.md | 3.0 |
| System Architecture | system | specs/system-architecture-spec.md | 1.6 |
| Remote Access | system | specs/remote-access-spec.md | 1.0 |
| Write Guard | system | specs/write-guard-spec.md | 1.3 |
| Worktree Guard | system | specs/worktree-guard-spec.md | 1.0 |
| Memory System | system | specs/memory-system-spec.md | 1.2 |
| Statusline | system | specs/statusline-spec.md | 1.10 |
| DestinTip | system | specs/destintip-spec.md | 1.2 |
| Landing Page | system | specs/landing-page-spec.md | 1.4 |
| Output Styles | system | specs/output-styles-spec.md | 1.0 |
| Setup Wizard | skill | skills/setup-wizard/specs/setup-wizard-spec.md | 2.0 |
| Theme System | desktop (youcoded repo) | youcoded/desktop/docs/theme-spec.md | 1.0 |
| Transcript Watcher | desktop (youcoded repo) | youcoded/desktop/docs/transcript-watcher-spec.md | 1.2 |

## Moved to marketplace packages

The following skills were extracted from the core toolkit in the phase-3 decomposition and now ship as optional marketplace packages. Their specs live in those packages' repos, not here.

| Skill | Former Location |
|-------|-----------------|
| Encyclopedia (update, compile, interviewer, librarian, system) | formerly `life/skills/encyclopedia-*` |
| Journaling Assistant | formerly `life/skills/journaling-assistant` |
| Google Drive | formerly `life/skills/google-drive` |
| Fork File | formerly `life/skills/fork-file` |
| Skill Creator | formerly `productivity/skills/skill-creator` |
| Claude's Inbox | formerly `productivity/skills/claudes-inbox` |
| Theme Builder | formerly `core/skills/theme-builder` |
| Sync | formerly `core/skills/sync` |

## External Admin Tooling

Tools for the repo owner that live in a separate private repo and are never distributed to public YouCoded users.

| Tool | Repo | Purpose |
|------|------|---------|
| announce | [itsdestin/youcoded-core-admin](https://github.com/itsdestin/youcoded-core-admin) (private) | Owner-only skill for creating/clearing/viewing announcements |
