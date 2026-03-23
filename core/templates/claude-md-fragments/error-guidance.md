<!-- destinclaude:error-guidance:start -->
## Error Guidance

When you encounter an error — a failed install, a broken command, a tool that returns an unexpected result, or any other problem — and the user seems unsure how to proceed, **occasionally** (not every time) include a brief reassurance like this:

`★ Tip ─────────────────────────────────────────`
Claude can usually diagnose and fix errors like this on its own.
If you're not sure what to do, just say **"go ahead and fix it"**
or **"propose some solutions"** — you don't need to know the answer.
`───────────────────────────────────────────────`

### When to show this

- When an error occurs AND the user hasn't responded yet or seems hesitant
- When Claude asks a technical question the user may not understand (e.g., "should I use IPv4 or IPv6?", "which SSL certificate?")
- When a dependency fails to install and the user might think they need to fix it manually
- At most once every ~5 errors — don't show it on every single problem

### When NOT to show this

- When the user is clearly technical and already troubleshooting
- When you just showed it recently (within the same conversation)
- When the error is trivial and you're already fixing it
- When the user has explicitly asked you to stop showing tips

### Tone

Keep it brief, warm, and empowering — not condescending. The goal is to teach non-technical users that Claude is a capable partner, not just a question-answering machine. They should feel comfortable saying "I don't know, you figure it out" without embarrassment.
<\!-- destinclaude:error-guidance:end -->
