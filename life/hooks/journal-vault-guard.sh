#!/bin/bash
# journal-vault-guard.sh — PreToolUse hook
# Intercepts Bash (rclone) and Read commands targeting journal paths.
# Blocks and instructs Claude to use local vault paths instead.

CLAUDE_DIR="$HOME/.claude"
VAULT_TEMP="$CLAUDE_DIR/.vault-temp"
VAULT_PS1="$CLAUDE_DIR/plugins/destinclaude/life/hooks/journal-vault.ps1"
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"

# Read hook input from stdin
STDIN_JSON=$(cat)

# Determine tool name from hook context
# PreToolUse hooks receive tool_name and tool_input
TOOL_NAME=$(echo "$STDIN_JSON" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const j=JSON.parse(d);console.log(j.tool_name||'')}catch{console.log('')}
  })" 2>/dev/null)

# --- Handle Bash tool (rclone commands) ---
if [[ "$TOOL_NAME" == "Bash" || "$TOOL_NAME" == "mcp__windows-control__PowerShell" ]]; then
    COMMAND=$(echo "$STDIN_JSON" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        try{const j=JSON.parse(d);console.log(j.tool_input?.command||'')}catch{console.log('')}
      })" 2>/dev/null)

    # Only intercept rclone commands targeting The Journal
    if ! echo "$COMMAND" | grep -q 'rclone' || \
       ! echo "$COMMAND" | grep -q 'The Journal'; then
        exit 0  # Not a journal rclone command — allow
    fi

    # Touch last-access if unlocked
    if [[ -f "$VAULT_TEMP/.unlocked" ]]; then
        date -Iseconds > "$VAULT_TEMP/.last-access"
    fi

    # Check vault state
    if [[ ! -f "$VAULT_TEMP/.unlocked" ]]; then
        # Vault is locked — trigger unlock
        RESULT=$(pwsh -File "$VAULT_PS1" unlock 2>&1)
        if [[ "$RESULT" == UNLOCKED:* ]]; then
            VAULT_TEMP="${RESULT#UNLOCKED:}"
        elif [[ "$RESULT" == ALREADY_UNLOCKED:* ]]; then
            VAULT_TEMP="${RESULT#ALREADY_UNLOCKED:}"
        else
            echo "Journal vault unlock was cancelled or failed. Cannot access journal files."
            exit 1
        fi
    fi

    # Vault is unlocked — instruct Claude to use local paths
    VAULT_TEMP_UNIX=$(echo "$VAULT_TEMP" | sed 's|\\|/|g')

    # Determine the rclone subcommand and build instruction
    if echo "$COMMAND" | grep -qE 'rclone\s+cat\b'; then
        # Read operation
        REMOTE_PATH=$(echo "$COMMAND" | grep -oP 'gdrive:[^"'\'']+' | head -1)
        RELATIVE_PATH=$(echo "$REMOTE_PATH" | sed -E 's|gdrive:Claude[^/]*/The Journal/||')
        echo "VAULT ACTIVE — use local path instead of rclone."
        echo "Replace this command with: cat \"$VAULT_TEMP_UNIX/$RELATIVE_PATH\""
        echo "The vault temp directory is: $VAULT_TEMP_UNIX"
        exit 1
    elif echo "$COMMAND" | grep -qE 'rclone\s+(ls|lsd|lsf)'; then
        REMOTE_PATH=$(echo "$COMMAND" | grep -oP 'gdrive:[^"'\'']+' | head -1)
        RELATIVE_PATH=$(echo "$REMOTE_PATH" | sed -E 's|gdrive:Claude[^/]*/The Journal/||')
        echo "VAULT ACTIVE — use local path instead of rclone."
        echo "Replace this command with: ls \"$VAULT_TEMP_UNIX/$RELATIVE_PATH\""
        exit 1
    elif echo "$COMMAND" | grep -qE 'rclone\s+(copyto|copy|moveto|move)'; then
        # Write operation — extract source and destination
        REMOTE_PATH=$(echo "$COMMAND" | grep -oP 'gdrive:[^"'\'']+' | head -1)
        RELATIVE_PATH=$(echo "$REMOTE_PATH" | sed -E 's|gdrive:Claude[^/]*/The Journal/||')
        # Extract the source path: the argument that is NOT the gdrive: path and NOT the rclone subcommand
        # Works by removing the rclone command prefix and the gdrive: path, leaving the source
        SOURCE_PATH=$(echo "$COMMAND" | sed -E 's|rclone\s+(copyto|copy|moveto|move)\s+||' | sed -E 's|"?gdrive:[^"]*"?||' | sed 's|^ *||;s| *$||' | sed 's|^"||;s|"$||')
        echo "VAULT ACTIVE — use local path instead of rclone."
        echo "Replace this command with: cp \"$SOURCE_PATH\" \"$VAULT_TEMP_UNIX/$RELATIVE_PATH\" && touch \"$VAULT_TEMP_UNIX/.dirty\""
        echo "The vault temp directory is: $VAULT_TEMP_UNIX"
        exit 1
    elif echo "$COMMAND" | grep -qE 'rclone\s+sync'; then
        REMOTE_PATH=$(echo "$COMMAND" | grep -oP 'gdrive:[^"'\'']+' | head -1)
        RELATIVE_PATH=$(echo "$REMOTE_PATH" | sed -E 's|gdrive:Claude[^/]*/The Journal/||')
        DEST_PATH=$(echo "$COMMAND" | awk '{print $NF}')
        echo "VAULT ACTIVE — use local path instead of rclone."
        echo "Replace this command with: cp -r \"$VAULT_TEMP_UNIX/${RELATIVE_PATH}\"* \"$DEST_PATH/\""
        exit 1
    elif echo "$COMMAND" | grep -qE 'rclone\s+(purge|delete)'; then
        echo "VAULT ACTIVE — delete operations on The Journal are not supported while vault is active."
        exit 1
    else
        echo "VAULT ACTIVE — this rclone command targets The Journal but couldn't be translated."
        echo "The vault temp directory is: $VAULT_TEMP_UNIX"
        echo "Adapt the command to use local filesystem paths under that directory instead."
        exit 1
    fi
fi

# --- Handle Read tool (encyclopedia cache) ---
if [[ "$TOOL_NAME" == "Read" ]]; then
    FILE_PATH=$(echo "$STDIN_JSON" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
        try{const j=JSON.parse(d);const p=j.tool_input?.file_path||'';
        console.log(p.split(String.fromCharCode(92)).join('/'))}catch{console.log('')}
      })" 2>/dev/null)

    # Only intercept encyclopedia cache reads
    ENCYCLOPEDIA_DIR_UNIX=$(echo "$ENCYCLOPEDIA_DIR" | sed 's|\\|/|g')
    if ! echo "$FILE_PATH" | grep -q "$ENCYCLOPEDIA_DIR_UNIX"; then
        exit 0  # Not an encyclopedia read — allow
    fi

    # Touch last-access if unlocked
    if [[ -f "$VAULT_TEMP/.unlocked" ]]; then
        date -Iseconds > "$VAULT_TEMP/.last-access"
    fi

    # If cache is populated and vault is unlocked, allow
    if [[ -f "$VAULT_TEMP/.unlocked" ]] && [[ -d "$ENCYCLOPEDIA_DIR" ]] && [[ "$(ls -A "$ENCYCLOPEDIA_DIR" 2>/dev/null)" ]]; then
        exit 0  # Cache is populated — allow the read
    fi

    # Cache is empty or vault is locked — trigger unlock
    if [[ ! -f "$VAULT_TEMP/.unlocked" ]]; then
        RESULT=$(pwsh -File "$VAULT_PS1" unlock 2>&1)
        if [[ "$RESULT" != UNLOCKED:* ]] && [[ "$RESULT" != ALREADY_UNLOCKED:* ]]; then
            echo "Journal vault unlock was cancelled or failed. Cannot read encyclopedia files."
            exit 1
        fi
    fi

    # Cache should now be populated by unlock — allow the read
    exit 0
fi

# Not a tool we care about — allow
exit 0
