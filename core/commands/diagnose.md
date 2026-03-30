---
name: diagnose
description: Run a full system diagnostic — sync health, git status, Drive connectivity, file integrity, debounce state, active sessions, and recent errors. Use when debugging sync issues or when something feels wrong.
user-invocable: true
---

# /diagnose — System Diagnostic

Run each diagnostic section below in sequence. Present all results in a single structured output. Do NOT ask for confirmation between sections — run everything and present the full report.

## 1. Sync Health

```bash
echo "=== Sync Status ===" && cat ~/.claude/.sync-status 2>/dev/null || echo "(no sync status file)"
echo "" && echo "=== Sync Warnings ===" && cat ~/.claude/.sync-warnings 2>/dev/null || echo "(no warnings)"
```

## 2. Git Status

```bash
echo "=== Git Status ===" && cd ~/.claude && git status --short 2>/dev/null | head -20
echo "" && echo "Unpushed commits:" && git log --oneline origin/main..HEAD 2>/dev/null | wc -l
echo "" && echo "Last push marker:" && if [ -f ~/.claude/.push-marker ]; then echo "$(( $(date +%s) - $(cat ~/.claude/.push-marker) ))s ago"; else echo "(no marker)"; fi
```

## 3. Recent Errors

```bash
echo "=== Recent Errors (last 15) ===" && grep -E '"level":"(ERROR|WARN)"|\[(ERROR|WARN)\]' ~/.claude/backup.log 2>/dev/null | tail -15
```

## 4. Active Sessions

```bash
echo "=== Active Sessions ===" && for f in ~/.claude/sessions/*.json 2>/dev/null; do [ -f "$f" ] || continue; pid=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$f')).pid)}catch{console.log('?')}" 2>/dev/null); alive=$(kill -0 $pid 2>/dev/null && echo "alive" || echo "dead"); echo "  $(basename $f) PID=$pid ($alive)"; done
```

## 5. Debounce State

```bash
echo "=== Debounce State ===" && for marker in ~/.claude/.push-marker ~/.claude/toolkit-state/.personal-sync-marker ~/.claude/toolkit-state/.session-sync-marker; do if [ -f "$marker" ]; then age=$(( $(date +%s) - $(cat "$marker") )); echo "  $(basename $marker): ${age}s ago"; else echo "  $(basename $marker): (not set)"; fi; done
```

## 6. Drive Connectivity

```bash
echo "=== Drive Connectivity ===" && if command -v rclone &>/dev/null; then timeout 5 rclone lsd gdrive: --max-depth 0 2>&1 | head -3 || echo "Drive check timed out or failed"; else echo "rclone not installed"; fi
```

## 7. File Integrity

```bash
echo "=== JSONL Integrity ===" && corrupt=0; total=0; for f in ~/.claude/projects/*/*.jsonl; do [ -f "$f" ] || continue; total=$((total+1)); if grep -Pq '\x00' "$f" 2>/dev/null; then echo "  NULL BYTES: $(basename $f)"; corrupt=$((corrupt+1)); fi; done; echo "  Scanned: $total files, $corrupt with null bytes"
```

## 8. Desktop App

```bash
echo "=== Desktop Log (last 5 errors) ===" && if [ -f ~/.claude/desktop.log ]; then grep '"level":"ERROR"' ~/.claude/desktop.log 2>/dev/null | tail -5 || echo "(no errors)"; else echo "(no desktop log)"; fi
```

## 9. Log Sizes

```bash
echo "=== Log Sizes ===" && wc -l ~/.claude/backup.log ~/.claude/statusline.log ~/.claude/desktop.log 2>/dev/null || echo "(some logs missing)"
```

## 10. Toolkit Version

```bash
echo "=== Toolkit ===" && cat ~/.claude/toolkit-state/update-status.json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log('Current:',j.current,'Latest:',j.latest,'Update:',j.update_available)}catch{console.log('(parse error)')}})" 2>/dev/null || echo "(no version info)"
```

## Present Results

After running all sections, present the output as a structured diagnostic report. Highlight any problems found:
- Sync warnings or errors → suggest `/sync` to investigate
- Unpushed commits > 0 → git push may be failing
- Stale debounce markers (>1 hour) → sync may be stuck
- Null-byte files → suggest manual inspection
- Dead sessions → leftover PIDs from crashed processes
- Drive connectivity failure → rclone config issue
