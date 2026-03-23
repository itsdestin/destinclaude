# Your New Toolkit

Setup is done — here's what you need to know going forward.

## What Just Happened

The setup wizard installed a collection of skills, hooks, and tools into your Claude Code setup. Nothing on your computer changed except inside the `~/.claude/` folder (that's Claude's configuration directory). Everything the toolkit added can be cleanly removed with `/toolkit-uninstall` if you ever want to go back to plain Claude Code.

## Five Commands to Remember

These are typed directly into Claude — just type the `/` and the command name:

| Command | What It Does |
|---------|-------------|
| `/toolkit` | Shows everything you can do — skills, phrases, hooks |
| `/health` | Checks that everything is working properly |
| `/update` | Checks for new features and installs them |
| `/setup-wizard` | Re-runs setup (safe to run anytime) |
| `/toolkit-uninstall` | Removes the toolkit and restores your old setup |

You don't need to memorize these — you can always ask Claude "what commands do I have?" and it'll tell you.

## Five Things to Try

You don't need special commands for these. Just say them in plain English:

**"Let's journal"**
Start a daily journal entry. Claude asks about your day conversationally — what happened, how you felt, what's on your mind. Entries are saved by date automatically.

**"Check my inbox"**
If you use Todoist, Claude processes any notes you've captured on your phone — answering questions, creating tasks, or filing information.

**"Brief me on [person's name]"**
Pull together everything you've told Claude about someone — useful before a meeting or visit.

**"What skills do I have installed?"**
Claude shows you everything available, with the phrases that trigger each skill.

**"Help me set up [feature]"**
If you skipped something during setup (like Google Drive or text messaging), just ask Claude to help you set it up later.

## How Updates Work

The toolkit improves over time. You'll see a notice in your status bar when an update is available. To install it:

```
/update
```

Claude shows you what changed, asks if you want to update, and handles everything. Your personal data (journal entries, encyclopedia, memory) is never affected by updates — only the toolkit code changes.

## If Something Goes Wrong

Just tell Claude what happened. Seriously — describe the problem in plain English:

- "The status bar isn't showing anything"
- "I got an error when I tried to journal"
- "Something seems broken"

Claude can usually diagnose and fix issues on the spot. If it can't, it'll tell you what to do.

You can also run `/health` to get a quick check of all components.

## What's Next

The toolkit grows with you. The more you use it, the more Claude learns about you and the more useful it becomes. Start with journaling — it's the foundation that feeds everything else.

If you want to see the full list of everything available, type `/toolkit`.
