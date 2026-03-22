---
name: google-drive
description: Use this skill whenever the user mentions Google Drive, gdrive, or wants to list, upload, download, copy, move, delete, or create files/folders in Google Drive. Always use rclone with the gdrive: remote — never use browser automation, the Drive web UI, or any other method. This skill must trigger for ANY Google Drive request, even simple ones like "show me my Drive files" or "put this file in Drive".
---
<!-- SPEC: Read specs/google-drive-spec.md before modifying this file -->

# Google Drive via rclone

Always use `rclone` with the `gdrive:` remote for all Google Drive operations. Never attempt to use browser automation, MCP tools, or the Drive web UI.

## Remote name

The configured remote is `gdrive:`. Always prefix paths with `gdrive:`.

Examples:
- Root of Drive → `gdrive:`
- A folder → `gdrive:Claude`
- A nested path → `gdrive:Projects/Work/report.pdf`

## Common Commands

### List files and folders
```bash
rclone ls gdrive:                        # list all files recursively (with sizes)
rclone lsd gdrive:                       # list directories only (top level)
rclone lsd gdrive:FolderName             # list subdirectories inside a folder
rclone lsf gdrive:                       # flat list, good for scripts
rclone lsf gdrive:FolderName --dirs-only # only folders
```

### Create a folder
```bash
rclone mkdir gdrive:FolderName
rclone mkdir "gdrive:Parent/Child"
```

### Upload (local → Drive)
```bash
rclone copy /local/file.txt gdrive:TargetFolder/
rclone copy /local/folder/ gdrive:TargetFolder/ --progress
```

### Download (Drive → local)
```bash
rclone copy gdrive:FolderName/file.txt /local/destination/
rclone copy gdrive:FolderName/ /local/destination/ --progress
```

### Move / Rename
```bash
rclone moveto gdrive:OldName/file.txt gdrive:NewName/file.txt
rclone move gdrive:SourceFolder/ gdrive:DestFolder/
```

### Delete
```bash
rclone deletefile gdrive:FolderName/file.txt   # delete a single file
rclone purge gdrive:FolderName                 # delete folder and all contents
```

### Sync (mirror local → Drive, deletions included)
```bash
rclone sync /local/folder/ gdrive:TargetFolder/ --progress
```

### Check / diff
```bash
rclone check /local/folder/ gdrive:RemoteFolder/
```

### Search for a file by name
```bash
rclone lsf gdrive: --include "filename.ext"
```

## Tips

- Use `--dry-run` before any destructive operation (`move`, `sync`, `purge`) to preview what will happen.
- Use `--progress` for large transfers to show live progress.
- Paths with spaces must be quoted: `"gdrive:My Folder/file.txt"`
- `rclone ls` lists files recursively; `rclone lsf` is better for scripting.
- To check the remote is working: `rclone lsd gdrive:` — if it returns without error, auth is fine.

---
**System rules:** If this skill or its supporting files are modified, follow the System Change Protocol in `CLAUDE.md` and the System Change Checklist in `~/.claude/docs/system.md`. All items are mandatory.
