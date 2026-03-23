# Version Migrations

Each file in this directory is a migration script named by the version it applies to.
A migration runs for users upgrading FROM any version before it TO that version or later.

## Contract

- Filename: `X.Y.Z.sh` (semver, no `v` prefix)
- Receives env vars: `TOOLKIT_ROOT`, `CLAUDE_HOME`, `PLATFORM`
- Outputs using `[STATUS] item — message` format
- Must be idempotent (safe to run multiple times)
- Must not auto-delete user files
