<!-- SPEC: Read core/specs/remote-access-spec.md before modifying this file -->
---
name: remote-setup
description: Set up remote access for DestinCode — installs Tailscale, configures password, and walks you through connecting from your phone. Use when the user says "set up remote access", "remote setup", "I want to use DestinCode from my phone", or similar.
---

# Remote Access Setup

You are setting up remote access for DestinCode so the user can access it from their phone or any other device. Be conversational and explain things simply — the user may not be technical.

**IMPORTANT:** Never tell the user to run a command themselves or in a separate window. Always run commands directly using the Bash tool. The only user action should be signing in via a browser window that pops up automatically.

**Goal:** By the end, the user will have:
1. Tailscale installed and authenticated
2. A remote access password set
3. DestinCode accessible from their phone

---

## Step 1: Check current state

Before doing anything, check what's already set up:

On Windows, Tailscale is NOT on the Git Bash PATH. Use the full path: `"/c/Program Files/Tailscale/tailscale.exe"`. On macOS/Linux, just use `tailscale`.

```bash
# Check if Tailscale is installed (use full path on Windows)
tailscale version 2>/dev/null && echo "TAILSCALE_INSTALLED=true" || echo "TAILSCALE_INSTALLED=false"

# Check if Tailscale is connected
tailscale status 2>/dev/null && echo "TAILSCALE_CONNECTED=true" || echo "TAILSCALE_CONNECTED=false"

# Check if remote config exists
cat ~/.claude/destincode-remote.json 2>/dev/null || echo "NO_CONFIG"

# Detect platform
uname -s 2>/dev/null || echo "Windows"
```

If everything is already set up (Tailscale connected + password configured), tell the user and skip to Step 5 (phone setup).

---

## Step 2: Install Tailscale

Explain to the user:
> "Tailscale creates a private network between your devices — like a secure tunnel that only you can use. It's free for personal use and takes about a minute to set up."

### Windows

```powershell
# Download and install Tailscale silently
winget install --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
```

If `winget` is not available, tell the user:
> "I can't install Tailscale automatically on your system. Please download it from https://tailscale.com/download/windows and run the installer. Let me know when it's done."

### macOS

```bash
brew install --cask tailscale
```

If `brew` is not available:
> "Please download Tailscale from https://tailscale.com/download/mac and install it. Let me know when it's done."

### Linux

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

After installation, verify:
```bash
tailscale version
```

---

## Step 3: Connect Tailscale

**IMPORTANT:** Never ask the user to run a command themselves. Always run commands directly using the Bash tool.

On Windows, Tailscale installs to `C:\Program Files\Tailscale\` and is NOT on the Git Bash PATH. Use the full path for all Tailscale commands:

```bash
# Windows
"/c/Program Files/Tailscale/tailscale.exe" up

# macOS / Linux
tailscale up
```

Run this command yourself. It will either open a browser window automatically or print a login URL. Tell the user:

> "A browser window should have popped up for Tailscale sign-in — the Tailscale installation may have also opened its own sign-in window, either one works. Sign in with Google, Microsoft, GitHub, or Apple — whichever you prefer. This is a one-time step. Let me know once you've signed in."

Wait for them to confirm they've authenticated, then verify:

```bash
tailscale ip -4
```

This should return a `100.x.x.x` IP address. Save this — it's their Tailscale IP.

```bash
tailscale status --json | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const s=JSON.parse(d);console.log('Hostname:', s.Self?.HostName || 'unknown')"
```

Tell the user their Tailscale IP and hostname.

---

## Step 4: Configure remote access password

> "Now let's set a password for remote access. This is what you'll type when connecting from your phone."

Ask the user to choose a password. Then set it:

```bash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const password = process.argv[1];
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const stored = salt + ':' + hash;
const configPath = path.join(os.homedir(), '.claude', 'destincode-remote.json');
let config = { enabled: true, port: 9900, passwordHash: null, trustTailscale: true };
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
config.passwordHash = stored;
config.enabled = true;
config.trustTailscale = true;
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Password set and Tailscale trust enabled.');
" "USER_PASSWORD_HERE"
```

Replace `USER_PASSWORD_HERE` with the password the user chose.

> "I've set your password and enabled Tailscale trust mode. When you're on your Tailscale network, you won't even need to type the password — Tailscale handles authentication for you."

---

## Step 5: Phone setup

> "Last step — let's get your phone connected. Here's what to do:"

Tell the user:

> **1. Install Tailscale on your phone**
> - iPhone: Search "Tailscale" in the App Store
> - Android: Search "Tailscale" in the Google Play Store
>
> **2. Sign in with the same account** you just used on your computer
>
> **3. Open your browser** and go to:
> `http://TAILSCALE_IP:9900`
>
> That's it! You should see the DestinCode login screen. If you enabled Tailscale trust, you'll be logged in automatically.

Replace `TAILSCALE_IP` with their actual Tailscale IP from Step 3.

> "You can also find this URL anytime by clicking the gear icon in DestinCode and looking under the Tailscale section. There's a QR code you can scan too."

---

## Step 6: Verify

> "Let me verify everything is working..."

```bash
# Check Tailscale is connected
tailscale status | head -5

# Check remote server config
node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const configPath = path.join(os.homedir(), '.claude', 'destincode-remote.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('Remote access:', config.enabled ? 'enabled' : 'disabled');
console.log('Password:', config.passwordHash ? 'set' : 'NOT SET');
console.log('Tailscale trust:', config.trustTailscale ? 'enabled' : 'disabled');
console.log('Port:', config.port);
"

# Check remote server is listening
node -e "
const http = require('http');
http.get('http://localhost:9900', (res) => {
  console.log('Remote server: listening (HTTP', res.statusCode, ')');
}).on('error', () => {
  console.log('Remote server: NOT RUNNING — restart DestinCode to activate');
});
"
```

Summarize:
> "Here's your setup:
> - Tailscale IP: `100.x.x.x`
> - Remote URL: `http://100.x.x.x:9900`
> - Password: set
> - Tailscale trust: enabled (no password needed from your devices)
>
> Open that URL on your phone to start using DestinCode remotely. The settings gear in DestinCode has a QR code you can scan too."
