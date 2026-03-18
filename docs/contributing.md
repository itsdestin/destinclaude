# Contributing

Made an improvement to the toolkit? Here's how to share it.

## The Easy Way: /contribute

The toolkit includes a built-in contribution command that handles everything for you:

```
/contribute
```

Claude will:
1. Check what you've changed since your last update
2. Filter out all personal content (journal entries, encyclopedia data, memory, credentials — nothing private is ever included)
3. Show you what's changed in plain language
4. Let you pick which changes to include
5. Create a pull request on GitHub

That's it. You don't need to know git, GitHub, or how pull requests work. Claude handles the mechanics.

## What You'll Need

**A GitHub account.** If you don't have one, go to https://github.com and sign up (it's free).

**The GitHub CLI (`gh`).** Claude will offer to install it for you when you first run `/contribute`. Or install it yourself:

- **Mac:** `brew install gh`
- **Windows:** `winget install GitHub.cli`
- **Linux:** See https://github.com/cli/cli#installation

**Authentication.** Run `gh auth login` and follow the prompts. Claude will walk you through this if you haven't done it.

> **Note:** If you skipped GitHub setup during `/setup-wizard`, that's fine. `/contribute` will walk you through it when you're ready.

## What Makes a Good Contribution

**Improvements to skills:** Better prompts, smarter logic, new capabilities. If a skill does something in a clunky way and you found a better approach, that's a great contribution.

**Bug fixes:** If something doesn't work right and you fixed it, submit it.

**New hooks or utilities:** Built something useful? Others might want it too.

**Documentation improvements:** Clearer explanations, better examples, typo fixes.

## What's Automatically Excluded

The `/contribute` command (and the underlying contribution detector) automatically filters out:

- Encyclopedia content (`**/encyclopedia/**`)
- Journal entries (`**/journal/**`)
- Memory files (`**/memory/**`)
- Environment files (`**/.env`)
- Anything with "token", "secret", or "credential" in the path
- Everything in `.private/` directories
- Any patterns listed in `.private-manifest`

You can add your own exclusion patterns to `.private-manifest` — it uses gitignore-style syntax, one pattern per line.

## How It Works Behind the Scenes

For the curious:

1. `/contribute` diffs your local toolkit against the version you installed (tracked by git tag)
2. Changed files are filtered against `.private-manifest` patterns
3. A fork of the upstream repo is created on your GitHub account (if you don't have one)
4. Selected changes are committed to a new branch on your fork
5. A pull request is opened from your fork to the main repo
6. The maintainer reviews and merges (or asks questions)

## The Contribution Detector

You might notice Claude occasionally mention something like: "That tweak you made to the inbox processor looks useful — want me to send it to the maintainer?"

That's the contribution detector — a background hook that notices when you've improved toolkit files. It only suggests once per change, and if you ignore it or say no, it won't ask again.

## After You Submit

The maintainer (currently just one person) reviews pull requests and merges improvements that benefit everyone. You'll get a notification on GitHub when your contribution is accepted.

If changes are requested, Claude can help you update your submission — just say so.

## Questions?

Ask Claude: "How does the contribution system work?" or "What have I changed in the toolkit?"
