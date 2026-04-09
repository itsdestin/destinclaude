---
name: diagnose
description: Run a full system diagnostic — toolkit health, write registry, app sync coordination, file integrity, active sessions, and recent errors. Use when something feels wrong.
user-invocable: true
---

# /diagnose — System Diagnostic

Run each diagnostic section below in sequence. Present all results in a single structured output. Do NOT ask for confirmation between sections — run everything and present the full report.

## 1. App Sync Coordination

```bash
echo "=== App Sync ===" && if [ -f ~/.claude/toolkit-state/.app-sync-active ]; then echo "DestinCode app is running (PID $(cat ~/.claude/toolkit-state/.app-sync-active 2>/dev/null)) — automatic sync is owned by the app."; else echo "App not detected — sync is manual via /sync skill."; fi
```

## 2. Sync Warnings

```bash
echo "=== Sync Warnings ===" && cat ~/.claude/.sync-warnings 2>/dev/null || echo "(no warnings)"
echo "" && echo "=== Unsynced Projects ===" && cat ~/.claude/.unsynced-projects 2>/dev/null || echo "(none)"
```

## 3. Last Backup Metadata

```bash
echo "=== Last Successful Push ===" && if [ -f ~/.claude/backup-meta.json ]; then cat ~/.claude/backup-meta.json; else echo "(no backup-meta.json yet)"; fi
```

## 4. Recent Errors

```bash
echo "=== Recent Errors (last 15) ===" && grep -E '"level":"(ERROR|WARN)"|\[(ERROR|WARN)\]' ~/.claude/backup.log 2>/dev/null | tail -15
```

## 5. Active Sessions

```bash
echo "=== Active Sessions ===" && for f in ~/.claude/sessions/*.json 2>/dev/null; do [ -f "$f" ] || continue; pid=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$f')).pid)}catch{console.log('?')}" 2>/dev/null); alive=$(kill -0 $pid 2>/dev/null && echo "alive" || echo "dead"); echo "  $(basename $f) PID=$pid ($alive)"; done
```

## 6. Write Registry (write-guard input)

```bash
echo "=== Write Registry ===" && if [ -f ~/.claude/.write-registry.json ]; then entries=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$HOME/.claude/.write-registry.json'))).length)" 2>/dev/null); echo "  $entries tracked file(s)"; else echo "  (no registry yet — first Write/Edit will create it)"; fi
echo "" && echo "=== write-registry.sh ===" && if [ -e ~/.claude/hooks/write-registry.sh ]; then echo "  installed"; else echo "  MISSING — run /update to install"; fi
```

## 7. Session-Start Debounce

```bash
echo "=== Session-Start Debounce ===" && marker=~/.claude/toolkit-state/.session-sync-marker; if [ -f "$marker" ]; then age=$(( $(date +%s) - $(cat "$marker") )); echo "  ${age}s ago"; else echo "  (not set)"; fi
```

## 8. File Integrity

```bash
echo "=== JSONL Integrity ===" && corrupt=0; total=0; for f in ~/.claude/projects/*/*.jsonl; do [ -f "$f" ] || continue; total=$((total+1)); if tr -d '\0' < "$f" | cmp -s - "$f"; then :; else echo "  NULL BYTES: $(basename $f)"; corrupt=$((corrupt+1)); fi; done; echo "  Scanned: $total files, $corrupt with null bytes"
```

## 9. Log Sizes

```bash
echo "=== Log Sizes ===" && wc -l ~/.claude/backup.log ~/.claude/statusline.log 2>/dev/null || echo "(some logs missing)"
```

## 10. Toolkit Version

```bash
echo "=== Toolkit ===" && cat ~/.claude/toolkit-state/update-status.json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('Current:',j.current,'Latest:',j.latest,'Update:',j.update_available)}catch{console.log('(parse error)')}})" 2>/dev/null || echo "(no version info)"
```

## Present Results

After running all sections, present the output as a structured diagnostic report. Highlight any problems found:
- App sync active + warnings present → mention that backend issues should be debugged in the DestinCode app's Sync panel
- Sync warnings or errors → suggest `/sync` to investigate
- Missing `write-registry.sh` → suggest `/update`
- Null-byte files → suggest manual inspection
- Dead sessions → leftover PIDs from crashed processes

For backend connectivity issues (Drive auth, GitHub credentials, iCloud path) — these are now owned by the DestinCode app. If the app is running, point the user to its Sync panel. If not, run `/sync` and use its "Test backends" action.
