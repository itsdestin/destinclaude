## Specs System

Before modifying any skill, hook, or system-level feature, read its spec file.
Spec locations: skill-specific at `~/.claude/skills/{name}/specs/{name}-spec.md`,
system-level at `~/.claude/specs/{topic}-spec.md`. Index at `~/.claude/specs/INDEX.md`.

Naming convention:
- Specs: `{topic}-spec.md` (no date; versioned in frontmatter)
- Designs: `{topic}-design (MM-DD-YYYY).md` (point-in-time architecture decisions)
- Plans: `{topic}-plan (MM-DD-YYYY).md` (implementation checklists)
- Plans/designs live in `~/.claude/plans/` (system-level) or `~/.claude/skills/{name}/plans/` (skill-level)

Rules:
1. **User Mandates** in a spec are inviolable. If a proposed change conflicts with a mandate, stop and ask for approval to revise the mandate before proceeding.
2. **Design Decisions** include rationale. Before proposing an alternative, read the rationale and present it alongside your proposal so the user can make an informed choice.
3. **Implementation** details can be changed freely as long as they don't violate mandates or silently reverse design decisions.
4. Specs are NEVER modified without the user's explicit approval of the specific changes.
5. After any approved spec change, bump the version and add a change log entry. Use minor bumps (1.0 -> 1.1) for small additions; major bumps (1.x -> 2.0) for architectural changes.
6. Routine implementation edits do NOT require spec updates. Only update specs when mandates change, design decisions are reversed/added, or architecture shifts.
7. After completing changes to a feature with a spec, review whether the spec needs updating before considering the work done.
8. If no spec exists for a feature you are modifying or creating, and that feature has behavior or workflow logic that a future session would need to understand, offer to create one.
