# DestinClaude Bootstrap Installer - Windows
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
    Write-Host "  Installing Git..." -ForegroundColor Yellow
    $wingetAvailable = $false
    try {
        & winget --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $wingetAvailable = $true }
    } catch {}

    if ($wingetAvailable) {
        winget install Git.Git --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "  Git install failed. Please install from https://git-scm.com/download/win" -ForegroundColor Red
            exit 1
        }
        # Refresh PATH so git is available in this session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Host "  Git installed" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Please install Git from https://git-scm.com/download/win" -ForegroundColor Red
        Write-Host "  Or install winget first, then re-run this script."
        exit 1
    }
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
    Write-Host "  Updating toolkit..." -ForegroundColor Yellow
    Push-Location $toolkitDir
    git pull --ff-only 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Toolkit updated" -ForegroundColor Green
    } else {
        Write-Host "  Toolkit update skipped (local changes present)" -ForegroundColor Yellow
    }
    Pop-Location
} else {
    Write-Host "  Cloning toolkit..." -ForegroundColor Yellow
    $pluginsDir = Join-Path $HOME ".claude\plugins"
    if (-not (Test-Path $pluginsDir)) { New-Item -ItemType Directory -Path $pluginsDir -Force | Out-Null }
    git clone https://github.com/itsdestin/destinclaude.git $toolkitDir
    Write-Host "  Toolkit cloned" -ForegroundColor Green
}

# --- Ensure Developer Mode is enabled (required for symlinks) ---
$devModeKey = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"
$devModeEnabled = $false
try {
    $val = Get-ItemProperty -Path $devModeKey -Name AllowDevelopmentWithoutDevLicense -ErrorAction Stop
    if ($val.AllowDevelopmentWithoutDevLicense -eq 1) { $devModeEnabled = $true }
} catch {}

if ($devModeEnabled) {
    Write-Host "  Developer Mode enabled" -ForegroundColor Green
} else {
    Write-Host "  Enabling Developer Mode (required for symlinks)..." -ForegroundColor Yellow
    Write-Host "  You may see a permission prompt — please approve it." -ForegroundColor Yellow
    try {
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if ($isAdmin) {
            New-ItemProperty -Path $devModeKey -Name AllowDevelopmentWithoutDevLicense -Value 1 -PropertyType DWORD -Force -ErrorAction Stop | Out-Null
        } else {
            Start-Process powershell -Verb RunAs -Wait -ArgumentList "-Command", "New-ItemProperty -Path '$devModeKey' -Name AllowDevelopmentWithoutDevLicense -Value 1 -PropertyType DWORD -Force | Out-Null" -ErrorAction Stop
        }
        # Verify it took effect
        $val = Get-ItemProperty -Path $devModeKey -Name AllowDevelopmentWithoutDevLicense -ErrorAction Stop
        if ($val.AllowDevelopmentWithoutDevLicense -eq 1) {
            Write-Host "  Developer Mode enabled" -ForegroundColor Green
        } else {
            throw "Value not set"
        }
    } catch {
        Write-Host ""
        Write-Host "  ERROR: Could not enable Developer Mode." -ForegroundColor Red
        Write-Host ""
        Write-Host "  Developer Mode is required for symlinks, which DestinClaude" -ForegroundColor Red
        Write-Host "  depends on. Please enable it manually:" -ForegroundColor Red
        Write-Host ""
        Write-Host "    Settings > System > For Developers > Developer Mode" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Then re-run this installer."
        exit 1
    }
}

# --- Register /setup command and wizard skill ---
Write-Host "  Registering setup wizard..." -ForegroundColor Yellow
$commandsDir = Join-Path $HOME ".claude\commands"
$skillsDir = Join-Path $HOME ".claude\skills"
if (-not (Test-Path $commandsDir)) { New-Item -ItemType Directory -Path $commandsDir -Force | Out-Null }
if (-not (Test-Path $skillsDir)) { New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null }

$commandSrc = Join-Path $toolkitDir "core\commands\setup-wizard.md"
$commandDst = Join-Path $commandsDir "setup-wizard.md"
$skillSrc = Join-Path $toolkitDir "core\skills\setup-wizard"
$skillDst = Join-Path $skillsDir "setup-wizard"

# Remove stale links/copies
$oldCommandDst = Join-Path $commandsDir "setup.md"
if (Test-Path $oldCommandDst) { Remove-Item $oldCommandDst -Force }
if (Test-Path $commandDst) { Remove-Item $commandDst -Force }
if (Test-Path $skillDst) { Remove-Item $skillDst -Recurse -Force }

# Create symlinks (required — no copy fallback)
try {
    New-Item -ItemType SymbolicLink -Path $commandDst -Target $commandSrc -Force -ErrorAction Stop | Out-Null
    New-Item -ItemType SymbolicLink -Path $skillDst -Target $skillSrc -Force -ErrorAction Stop | Out-Null
    Write-Host "  Setup wizard registered" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "  ERROR: Symlink creation failed." -ForegroundColor Red
    Write-Host "  Developer Mode must be enabled for symlinks to work." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please enable Developer Mode:" -ForegroundColor Yellow
    Write-Host "    Settings > System > For Developers > Developer Mode" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Then re-run this installer."
    exit 1
}

Write-Host ""
Write-Host ""
Write-Host ""
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  |   Download complete! Starting setup...            |" -ForegroundColor Green
Write-Host "  |                                                   |" -ForegroundColor Green
Write-Host "  =====================================================" -ForegroundColor Green
Write-Host ""

# Launch Claude and kick off the setup wizard automatically.
& claude "set me up"
