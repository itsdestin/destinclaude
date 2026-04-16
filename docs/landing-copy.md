# YouCoded Landing Page — Editable Copy

This file contains every piece of user-facing text on the landing page, organized by section. Edit freely and send back — I'll sync changes into `index.html`.

Conventions:

- `**bold**` → stays bold on the page
- `*italic*` → stays italic on the page
- `[link text](url)` → stays a link on the page
- `<WeCoded>` badge marker → renders as a small "WeCoded" badge pill
- Lines starting with `<!--` are notes to you (or me); leave or delete as you like

---

## Section 1 — Top Navigation

**Logo wordmark:** You**Coded** *(the "Coded" half picks up the accent color)* 

<!-- add "For Claude Code by Anthropic" in much smaller text under the YouCoded label

**Nav links (in order):** About · Demo · Features · Android · Download · FAQ

---

## Section 2 — Hero

**Headline (animated cycling):**

> Make Claude **Useful.** → **Fun.** → **Cute.** → ***Yours.***

<!-- Each word bumps the previous one out, settles with a tiny overshoot, then gets bumped. Final word "Yours." rests permanently, bold + italic, in the theme accent. Each word-switch will also swap the whole site's theme (see theme notes at bottom). -->

---

## Section 3 — About ("What is this?")

**Section label:** What is this?

**Section title:** More than a chatbot.

**Paragraph 1:**

> YouCoded is an add-on of sorts for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), which is a powerful agentic AI tool from Anthropic that can **create and edit any type of file**, **search the web**,  **run terminal commands**, and **navigate your screen**. While Claude Code was designed for coding, YouCoded turns it into something else entirely - a fully capable and customizable agentic AI assistant that doesn't require you to know how to use AI or understand what "agentic" means. With YouCoded, you can teach Claude to navigate emails from any provider, read and summarize your texts, rebuild your spreadsheets, help you study, and more. You get the most intriguing and intuitive form of AI available today, all without needing to become a fratty tech-bro to do it. 
> 
> 

**Paragraph 2:**

> YouCoded combines that powerful AI with a themeable chat UI, a community marketplace to share and download "skills" (instructions that give your Claude new abilites), multiplayer mini-games, custom integrations with external services, and remote access from any browser. 
> 
> 

**Permission note (smaller text, bottom of box):**

> Nothing happens without your permission. YouCoded will always ask before taking any action.

---

## Section 4 — Demo ("See it in action")

**Section label:** See it in action

<!-- This section is a gallery of 5 app mockups. Each has a short label, a title, and a description. The mockups themselves are visual only — no copy to edit there. -->

### 4a. Theme Builder

- **Label:** Theme Builder
- **Title:** Build a theme just by describing it.
- **Description:** Tell Claude the vibe you want and it builds full UI themes with custom wallpapers, colors, particle effects, icons, and mascot characters. Imagine "Liquid Glass", but built by a single guy in his bedroom who still outdid Apple's entire visual design team. Share your themes directly with friends or publish them to the WeCoded Marketplace for anyone to download.

### 4b. WeCoded Marketplace

- **Label:** WeCoded Marketplace
- **Title:** Browse, share, and download everything that makes the app yours.
  - **Description:** Themes, skills, and integrations -- all in one place. Install what you want, then share what you build. The marketplace is  the core of how YouCoded stays fun, social, and personal instead of feeling like another boring AI tool.
- **Sub-description (smaller, dimmer):** Coming soon: custom buddies that provide floating access to Claude across apps, custom status bar instruments, and native app modules (imagine your texts, emails, or calendar showing up in a themed panel right alongside the chat window). The WeCoded marketplace improves every day, and improves more quickly as more users join the ecosystem.

### 4c. Journaling & Personal History<WeCoded>

- **Label:** Journaling & Personal History
- **Title:** Talk about your day. The structure happens on its own.
- **Description:** Just start talking — about work, people, whatever's on your mind. Claude asks follow-up questions, pulls out tasks and calendar events without you having to ask, indexes information about your friends and family, and slowly builds a searchable history of your life. Want to remember a friend's birthday, your wife's favorite color, or what you had for lunch last Thursday? Just ask Claude. Have a big meeting tomorrow with colleagues you haven't seen lately? Have Claude prepare a briefing, entirely based on information you've previously provided. No templates, no forms. You talk, it organizes. All information is stored in your personal Google Drive, iCloud, or GitHub account. Must be downloaded from the marketplace.

### 4d. Cross-Device Backup & Sync

- **Label:** Cross-Device Backup & Sync
- **Title:** 
  
  <!-- fill this new section in for me. skills, conversations, and settings are automatically backed up to a preferred provider (Google Drive/iCloud/GitHub every 15 minutes and automatically downsynced to your other Windows, macOS, Linux, or Android devices.
- **Description:** 

### 4e. Multiplayer Games

- **Label:** Multiplayer Games
- **Title:** Play with friends while Claude works.
- **Description:** Claude Code can take time on big tasks. Instead of staring at a spinner and twiddling your thumbs, challenge your friends to a game of Connect 4 right inside the app while you wait. The goal is to take the boring tasks we all use AI for (studying, working, etc.) and make them slightly more fun by allowing us to do them with friends. Real-time multiplayer, in-game chat, powered by Cloudflare. More games coming, soon to be opened to community-built games in the marketplace.

---

## Section 5 — Features ("What you get")

**Section label:** What you get

**Section title:** Everything the app gives you.

<!-- we need to completely rebuild this section. instead of the big ugly cards (which largely repeat information found above anyway) we need to condense into a much bigger number of collabsible menu items. we need to add 1) Claude Code on Android: expands to explain that this runs the FULL terminal-based Claude Code on android, which no other app (even those from anthropic) does. You get all of Claude Code's agentic abilities without the jank and limitations of the real anthropic Claude mobile app. 2) remote accesss: expands to explain that we offer remote access. remote access takes the exact same UI you would see in the desktop or mobile app and either a) mirrors it two a browser for live input/output or b) jacks directly into the android app's native UI to replace the local android backend with your desktop. claude code has native remote from anthropic, but it's mega janky and ours is SIGNIFICANTLY better-than-native. also built-in anti-sleep features to keep your computer awake and ready for remote 3) Cross-device sync: explain cross device auto up/down syncing and restore-from-backup capabilites. includes conversation history, skills not downloaded from the marketplace, settings, etc. Not supported by native claude code alone. pick your backend. 4) Quality of Life Features: automatic session naming, multi-window chrome-like browsing and navigation, custom searchable menu for resuming past conversations, status lights and custom sounds to indicate claude is waiting for your input or has finished it's response (with custom sounds), additional custom hotkeys for session navigation and other stuff, both full-terminal (themed) and chat views, session flagging (complete hides sessions, priority sorts them to the top, helpful is informational, more custom flags coming soon), custom quick chips above the input bar for prompts or skills used regularaly (journal every day? add a quick chip!), status bar items with context info, theme switching, git branch, model selection and permissions modes, eventually other custom status bar items. obvious, but also improved readability/custom tool cards as opposed to terminal's wall of inscrutable text.

**Six feature cards:**

### 5a. Themes & Buddies

> Wallpapers, glassmorphism, particles, custom icons, and buddies — characters that tag along with your theme. Share them with friends or build your own with `/theme-builder`.

### 5b. WeCoded Marketplace

> Themes, skills, games, integrations, buddies, and more — 150+ items and growing. Install what you want, share what you build.

### 5c. Multiplayer Games

> Play with friends while Claude works. Because waiting for AI doesn't have to be boring.

### 5d. Runs Everywhere

> Windows, macOS, Linux, Android — plus remote access from any web browser. Your setup follows you.

### 5e. Journaling & Encyclopedia <WeCoded>

> Talk about your day and it gets organized automatically. Over time, Claude builds a living record of your life.

### 5f. Tasks & Messaging <WeCoded>

> Process your Todoist inbox, read and send texts, manage your calendar — all through conversation.

**Footnote under the grid:**

> Features marked <WeCoded> come from the [WeCoded marketplace](https://github.com/itsdestin/destinclaude), installable from within the app.

---

## Section 6 — Origin Story

**Body:**

> Honeslty? I really just wanted to journal. I built the Journaling and Life History sytem now available in the marketplace, and pretty quickly realized I wanted to share it with friends. However, the idea of opening "Claude Code" in the terminal scared away most of my friends almost immediately. I realized that the idea of advanced agentic AI is still rather new to most people, and that pursuading them to adopt my fancy new journaling system would require it to be MUCH more accessible and user-friendly. Towards this end, I kind of just... kept adding things? And now we're here.... 
> 
> 
> 
> Every line of YouCoded was written through conversation with Claude by me, **someone who has never written code**. Every feature, every platform port, every theme, every multiplayer game. The entire app was built and is currently maintained without a single line typed by hand.

**Link:** Built by Destin →  *(links to github.com/itsdestin)*

---

## Section 7 — Android ("Your pocket")

<!-- delete this section. it will be mentioned in the features section somewhat, but no longer needs its own section --> 

---

## Section 8 — Prerequisites ("Before you begin")

**Section label:** Before you begin

**Section title:** You'll need a couple of accounts.

**Three prereq cards:**

### 8a. Anthropic — Required, Paid

> A Claude Pro ($20/mo) or Max ($100–200/mo) subscription for Claude Code, which powers everything in YouCoded. The app itself is free — you're paying for the AI.

**Link:** Subscribe to Claude → *(claude.ai/upgrade)*

### 8b. Google or Apple — Required, Free

> WeCoded marketplace skills store your personal data in your own Google Drive or iCloud account.

**Link:** Create Google Account → *(accounts.google.com/signup)*

### 8c. GitHub — Required, Free

> Required to receive marketplace updates. Sign up with your Google or Apple account.

**Link:** Create GitHub Account → *(github.com/signup)*

### 8d. Integrations sub-section

**Title:** Available Integrations <WeCoded>

**Intro:** With skills from the WeCoded marketplace, YouCoded can link with all of the following services:

**Integration tags** *(each has a hover/tap description — listed below)*:

- **Google Drive:** YouCoded can automatically back up your journal entries, Encyclopedia, and system files to Google Drive — keeping everything safe and synced across sessions.
- **Google Docs:** YouCoded can create, read, and edit documents — drafting cover letters, memos, reports, and more directly in Google Docs.
- **Google Sheets:** YouCoded can create and analyze spreadsheets — building trackers, organizing data, and working with structured information in Google Sheets.
- **Google Slides:** YouCoded can create and edit slide decks and visual presentations in Google Slides.
- **Google Calendar:** YouCoded can read and create events on your Google Calendar. Mention an appointment in conversation or screenshot a flyer, and it can get scheduled automatically.
- **Gmail:** YouCoded can search your inbox, read threads, and compose replies in Gmail — all without leaving the app.
- **Google Messages:** YouCoded can read your SMS and RCS conversations and send texts on your behalf through Google Messages.
- **iMessage:** YouCoded can access your Apple Messages conversations and send texts through iMessage.
- **iCloud:** YouCoded can automatically back up your journal entries, Encyclopedia, and system files to iCloud Drive — keeping everything safe and synced across sessions.
- **Apple Notes:** YouCoded can read your existing Apple Notes and create new ones for quick reference and capture.
- **Apple Reminders:** YouCoded can add items to your Apple Reminders lists and help you keep track of things to do.
- **Apple Calendar:** YouCoded can read and create events on your Apple Calendar. Mention an appointment in conversation or screenshot a flyer, and it can get scheduled automatically.
- **Apple Mail:** YouCoded can search your inbox, read threads, and compose replies through Apple Mail.
- **Todoist:** YouCoded can manage your task list, process inbox items captured from your phone, create tasks from conversations, and help you stay on top of priorities.
- **GitHub:** YouCoded can receive marketplace updates and sync your configuration through GitHub, keeping your installation current with the latest features and fixes.
- **Chrome:** YouCoded can navigate websites, fill out forms, take screenshots, and interact with web pages through Chrome.
- **Safari:** YouCoded can navigate websites, fill out forms, take screenshots, and interact with web pages through Safari.
- **Canva:** YouCoded can generate graphics, edit presentations, and work with visual content directly in Canva.
- *(trailing pill:)* More coming soon...

**Note under the list:**

> **NOTE:** Some integrations require account authorization or additional setup. You can link these services at any time from within the app.

---

## Section 9 — Download ("Get started")

**Section label:** Get started

**Section title:** Download YouCoded

**Four download cards:** Windows · macOS · Linux · Android

**Note under cards:**

> Free and open source. Just bring your [Claude Pro or Max](https://claude.ai/upgrade) plan.
> On iPhone? Use YouCoded from Safari by connecting to any computer running the app via remote access.

---

## Section 10 — FAQ

**Section label:** Common questions

**Section title:** FAQ

### Q1. How is this different from claude.ai?

> Claude.ai is a chat website. YouCoded is an app built on top of **Claude Code** — a more powerful form of Claude that can create files, run terminal commands, manage your computer, and interact more meaningfully with a wider range of external services. Think of claude.ai as texting Claude, and YouCoded as giving Claude hands (with themes, a marketplace, games, and remote access layered on top).

### Q2. Is my data private?

> Everything YouCoded and your installed WeCoded skills create — journal entries, your Encyclopedia, tasks — is stored in **your own** Google Drive or iCloud account. While data is temporarily sent to Claude/Anthropic to make the actual AI work, the actual long-term storage of your data is all fully managed by you. YouCode only collects skills, themes, and other marketplace entries, and only if you choose to share.

### Q3. What does the $20/month get me?

> The $20 goes to Anthropic for a Claude Pro subscription, which gives you access to Claude Code — the AI that powers everything. YouCoded itself is free and open source. You're paying for the AI, not the app.

### Q4. What platforms does it run on?

> Windows, macOS, Linux, and Android are all fully supported with native apps. You can also access YouCoded remotely from any web browser. Apple ecosystem integrations (iMessage, Apple Notes, etc.) are only available on macOS.

### Q5. Do I need to know how to code?

> Not at all. YouCoded was built entirely by a non-developer using Claude Code itself. The app is designed for everyone — students, professionals, and anyone else who uses AI regularly. If you can use ChatGPT, you can use YouCoded. 

### Q6. I've heard bad things about "agentic" AI. Is it safe?

> YouCoded always asks for permission before taking actions, so it's hard to break things accidentally. Claude is also, in my personal experience, much less prone to errors and hallucinations than models like ChatGPT and Gemini. However, AI is still prone to errors and can make mistakes. Claude's permission settings should prevent these mistakes from being translated into action, but you should always monitor your AI assistant when in use to verify it's acting as intended. You should be especially cautious when taking advantage of "Bypass Permissions" mode, which allows Claude to act without your input. 

---

## Section 11 — Footer

**Logo:** You**Coded**

**Links:** GitHub · Built by Destin · *(Open Source pill)*

**Legal line:**

> MIT License · YouCoded is an independent, community-built project. Not affiliated with, endorsed by, or officially supported by Anthropic.

---

## Floating CTA + Back-to-top

- Floating pill (bottom-right): **Download ↓**
- Back-to-top button: **↑**

---

## Appendix — Theme-switching plan (not copy, for reference)

As the hero headline cycles, the site's theme swaps in sync:

| Word    | Theme                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Useful. | **midnight** (existing dark theme)                                                                      |
| Fun.    | **halftone** (existing halftone dimension theme)                                                        |
| Cute.   | **strawberry kitty** (new — port from the in-app theme, with background)                                |
| Yours.  | **creme** (final resting theme — needs patterned white/creme gradient background + better accent color) |

*(No copy edits needed here — just flagging the plan so you can see it alongside the text.)*
