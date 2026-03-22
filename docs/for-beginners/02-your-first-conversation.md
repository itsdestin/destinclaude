# Your First Conversation

Now that Claude Code is installed, let's use it. Open your terminal and type:

```
claude
```

You'll see something like this:

```
╭──────────────────────────────────╮
│ Claude Code                      │
│                                  │
│ Type your message to get started │
╰──────────────────────────────────╯

>
```

That `>` is your prompt. Type anything in plain English.

## Try These

**Ask a question:**
```
> What's the capital of Arizona?
```

**Ask it to create a file:**
```
> Create a file called shopping-list.txt with milk, eggs, and bread
```
Claude will actually create that file on your computer. It'll ask your permission first.

**Ask it to read something:**
```
> Read my shopping-list.txt and add butter to it
```

## How Conversations Work

Claude Code remembers everything within a single conversation. You can reference things you said earlier, and Claude keeps track.

But when you close the terminal and start a new conversation later, Claude starts fresh. That's where the toolkit's memory system helps — it gives Claude a way to remember things across conversations.

## Useful Things to Know

**Exiting:** Type `exit`, or press `Ctrl+C` twice, or type `/quit`.

**Slash commands:** Some features are triggered by typing `/` followed by a command name. For example:
- `/help` — shows available commands
- `/setup-wizard` — runs the toolkit setup wizard (after you install the toolkit)
- `/update` — checks for toolkit updates
- `/health` — checks that everything is working properly

**Permissions:** Claude will ask before doing anything that modifies your computer. You can approve each action individually or allow certain types of actions automatically.

**Cost:** Claude Code uses your Anthropic API credits or Claude Max subscription. Longer conversations use more credits. You can see usage in your Anthropic dashboard.

## What's Different About Skills?

Without the toolkit, Claude Code is a general assistant. It's smart, but it doesn't know anything specific about your life or workflows.

When you install the toolkit, Claude gains **skills** — specialized instructions that teach it how to do specific things well. For example, the journaling skill doesn't just write text; it knows how to:
- Ask follow-up questions that draw out details
- Organize entries by date in a specific folder
- Connect today's entry to things you've written before
- Surface unresolved topics from past entries

Skills make Claude opinionated and useful in a way that generic Claude isn't.

## Ready for the Toolkit?

Head to [Installing the Toolkit](03-installing-the-toolkit.md) to add skills, hooks, and the full personal knowledge system.
