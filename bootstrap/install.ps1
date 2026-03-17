# DestinClaude Bootstrap Installer — Windows
# Downloads prerequisites and clones the toolkit so Claude Code can finish setup.

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  DestinClaude Installer" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# --- Check for Node.js ---
$nodeFound = $false
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $nodeVersion) {
        Write-Host "  Node.js found: $nodeVersion" -ForegroundColor Green
        $nodeFound = $true
    }
} catch {}

if (-not $nodeFound) {
    Write-Host "  Installing Node.js..." -ForegroundColor Yellow
    $wingetAvailable = $false
    try {
        & winget --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $wingetAvailable = $true }
    } catch {}

    if ($wingetAvailable) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "  Node.js install failed. Please install from https://nodejs.org/" -ForegroundColor Red
            Write-Host "  Download the LTS version and run the installer."
            exit 1
        }
        # Refresh PATH so node is available in this session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  Node.js installed" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Please install Node.js from https://nodejs.org/" -ForegroundColor Red
        Write-Host "  Download the LTS version and run the installer."
        Write-Host "  Then re-run this script."
        exit 1
    }
}

# --- Check for git ---
$gitFound = $false
try {
    $gitVersion = & git --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitVersion) {
        Write-Host "  Git found: $gitVersion" -ForegroundColor Green
        $gitFound = $true
    }
} catch {}

if (-not $gitFound) {
    Write-Host ""
    Write-Host "  Git is required but not installed." -ForegroundColor Red
    Write-Host "  Install from https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  Or run: winget install Git.Git" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Install git, then re-run this script."
    exit 1
}

# --- Check for Claude Code ---
$claudeFound = $false
try {
    & claude --version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Claude Code found" -ForegroundColor Green
        $claudeFound = $true
    }
} catch {}

if (-not $claudeFound) {
    Write-Host "  Installing Claude Code..." -ForegroundColor Yellow
    npm install -g @anthropic-ai/claude-code
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    try {
        & claude --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Claude Code installed" -ForegroundColor Green
        } else {
            throw "not found"
        }
    } catch {
        Write-Host ""
        Write-Host "  Claude Code may need a new terminal session." -ForegroundColor Yellow
        Write-Host "  Close this window, open a new one, and re-run this script."
        exit 1
    }
}

# --- Clone the toolkit ---
$toolkitDir = Join-Path $HOME ".claude\plugins\destinclaude"
if (Test-Path $toolkitDir) {
    Write-Host "  Toolkit already cloned at $toolkitDir" -ForegroundColor Green
} else {
    Write-Host "  Cloning toolkit..." -ForegroundColor Yellow
    $pluginsDir = Join-Path $HOME ".claude\plugins"
    if (-not (Test-Path $pluginsDir)) { New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null }
    git clone https://github.com/itsdestin/destinclaude.git $toolkitDir
    Write-Host "  Toolkit cloned" -ForegroundColor Green
}

# --- Register /setup-wizard command and wizard skill ---
Write-Host "  Registering setup wizard..." -ForegroundColor Yellow
$commandsDir = Join-Path $HOME ".claude\commands"
$skillsDir = Join-Path $HOME ".claude\skills"
if (-not (Test-Path $commandsDir)) { New-Item -ItemType Directory -Path $commandsDir -Force | Out-Null }
if (-not (Test-Path $skillsDir)) { New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null }

$commandSrc = Join-Path $toolkitDir "core\commands\setup.md"
$commandDst = Join-Path $commandsDir "setup-wizard.md"
$skillSrc = Join-Path $toolkitDir "core\skills\setup-wizard"
$skillDst = Join-Path $skillsDir "setup-wizard"

# Remove stale links/copies
if (Test-Path $commandDst) { Remove-Item $commandDst -Force }
if (Test-Path $skillDst) { Remove-Item $skillDst -Recurse -Force }

# Try symlinks first, fall back to copy
$symlinkOk = $true
try {
    New-Item -ItemType SymbolicLink -Path $commandDst -Target $commandSrc -Force -ErrorAction Stop | Out-Null
    New-Item -ItemType SymbolicLink -Path $skillDst -Target $skillSrc -Force -ErrorAction Stop | Out-Null
} catch {
    $symlinkOk = $false
    Copy-Item $commandSrc $commandDst -Force
    Copy-Item $skillSrc $skillDst -Recurse -Force
}

if ($symlinkOk) {
    Write-Host "  Setup wizard registered" -ForegroundColor Green
} else {
    Write-Host "  Setup wizard registered (copied — enable Developer Mode for symlinks)" -ForegroundColor Green
}

Write-Host ""
Write-Host ""
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  |   Download complete!                              |" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  |   Now, just open a new terminal window, type      |" -ForegroundColor Green
Write-Host '  |   "claude", and hit the enter key.                |' -ForegroundColor Green
Write-Host "  |   This is how you will access Claude going        |" -ForegroundColor Green
Write-Host "  |   forward.                                        |" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  |   One final step:                                 |" -ForegroundColor Green
Write-Host '  |     Launch Claude and say "set me up."            |' -ForegroundColor Green
Write-Host "  |     Claude will walk you through a series of      |" -ForegroundColor Green
Write-Host "  |     questions to finalize and customize your      |" -ForegroundColor Green
Write-Host "  |     installation.                                 |" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host ""
