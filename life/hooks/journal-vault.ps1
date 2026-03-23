# journal-vault.ps1 — Journal Vault crypto engine
# Usage: pwsh -File journal-vault.ps1 <command> [options]
# Commands: init, unlock, lock, status, change-password, recover, rotate-recovery
# IMPORTANT: Requires PowerShell 7+ (pwsh), NOT Windows PowerShell 5.1 (powershell).
# AesGcm and ConvertFrom-Json -AsHashtable are .NET Core / PS7+ only.

param(
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet("init", "unlock", "lock", "status", "change-password", "recover", "rotate-recovery")]
    [string]$Command
)

$ErrorActionPreference = "Stop"

# --- Constants ---
$CLAUDE_DIR = "$HOME\.claude"
$VAULT_TEMP = "$CLAUDE_DIR\.vault-temp"
$CONFIG_FILE = "$CLAUDE_DIR\journal-vault.json"
$LIB_DIR = "$PSScriptRoot\lib"
$BLAKE2_DLL = "$LIB_DIR\Konscious.Security.Cryptography.Blake2.dll"
$ARGON2_DLL = "$LIB_DIR\Konscious.Security.Cryptography.Argon2.dll"

# Vault file format constants
$MAGIC = [System.Text.Encoding]::ASCII.GetBytes("JVLT")
$VERSION = [byte]1
$HEADER_FIXED_SIZE = 4 + 1 + 9 + 16 + 60 + 60 + 12  # 162 bytes before ciphertext

# Argon2id defaults
$ARGON2_MEMORY_KB = 65536   # 64 MB
$ARGON2_ITERATIONS = 3
$ARGON2_PARALLELISM = 1

# --- Load dependencies ---
# Blake2 must be loaded BEFORE Argon2 (Argon2 depends on Blake2)
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -Path $BLAKE2_DLL
Add-Type -Path $ARGON2_DLL

# --- Load config ---
$Config = @{ timeout_minutes = 15; vault_history_count = 10; vault_remote_path = "gdrive:Claude/The Journal/journal-vault.enc" }
if (Test-Path $CONFIG_FILE) {
    $Config = Get-Content $CONFIG_FILE | ConvertFrom-Json -AsHashtable
}

# --- Crypto helpers ---

function Derive-Key([byte[]]$Password, [byte[]]$Salt) {
    $argon2 = [Konscious.Security.Cryptography.Argon2id]::new($Password)
    $argon2.Salt = $Salt
    $argon2.MemorySize = $ARGON2_MEMORY_KB
    $argon2.Iterations = $ARGON2_ITERATIONS
    $argon2.DegreeOfParallelism = $ARGON2_PARALLELISM
    return $argon2.GetBytes(32)
}

function AesGcm-Encrypt([byte[]]$Key, [byte[]]$Plaintext) {
    $nonce = [byte[]]::new(12)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($nonce)
    $ciphertext = [byte[]]::new($Plaintext.Length)
    $tag = [byte[]]::new(16)
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
    $aes.Encrypt($nonce, $Plaintext, $ciphertext, $tag)
    $aes.Dispose()
    # Return nonce + ciphertext + tag
    $result = [byte[]]::new(12 + $Plaintext.Length + 16)
    [Buffer]::BlockCopy($nonce, 0, $result, 0, 12)
    [Buffer]::BlockCopy($ciphertext, 0, $result, 12, $Plaintext.Length)
    [Buffer]::BlockCopy($tag, 0, $result, 12 + $Plaintext.Length, 16)
    return $result
}

function AesGcm-Decrypt([byte[]]$Key, [byte[]]$Blob) {
    $nonce = $Blob[0..11]
    $tag = $Blob[($Blob.Length - 16)..($Blob.Length - 1)]
    $ciphertext = $Blob[12..($Blob.Length - 17)]
    $plaintext = [byte[]]::new($ciphertext.Length)
    $aes = [System.Security.Cryptography.AesGcm]::new($Key, 16)
    $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext)
    $aes.Dispose()
    return $plaintext
}

function Wrap-DEK([byte[]]$WrappingKey, [byte[]]$DEK) {
    return AesGcm-Encrypt $WrappingKey $DEK
}

function Unwrap-DEK([byte[]]$WrappingKey, [byte[]]$WrappedDEK) {
    return AesGcm-Decrypt $WrappingKey $WrappedDEK
}

# --- Vault file format ---

function Write-VaultFile([string]$Path, [byte[]]$Salt, [byte[]]$PasswordWrappedDEK, [byte[]]$RecoveryWrappedDEK, [byte[]]$EncryptedPayload) {
    $stream = [System.IO.File]::Create($Path)
    try {
        # Magic + version
        $stream.Write($MAGIC, 0, 4)
        $stream.WriteByte($VERSION)
        # Argon2 params (little-endian)
        $stream.Write([BitConverter]::GetBytes([uint32]$ARGON2_MEMORY_KB), 0, 4)
        $stream.Write([BitConverter]::GetBytes([uint32]$ARGON2_ITERATIONS), 0, 4)
        $stream.WriteByte([byte]$ARGON2_PARALLELISM)
        # Salt
        $stream.Write($Salt, 0, 16)
        # Wrapped DEKs (each is nonce+ciphertext+tag = 12+32+16 = 60 bytes)
        $stream.Write($PasswordWrappedDEK, 0, 60)
        $stream.Write($RecoveryWrappedDEK, 0, 60)
        # Vault nonce + ciphertext + tag (from EncryptedPayload)
        $stream.Write($EncryptedPayload, 0, $EncryptedPayload.Length)
    } finally {
        $stream.Close()
    }
}

function Read-VaultFile([string]$Path) {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $magic = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
    if ($magic -ne "JVLT") { throw "Invalid vault file (bad magic)" }
    $version = $bytes[4]
    if ($version -ne 1) { throw "Unsupported vault version: $version" }
    $offset = 5
    $memKB = [BitConverter]::ToUInt32($bytes, $offset); $offset += 4
    $iters = [BitConverter]::ToUInt32($bytes, $offset); $offset += 4
    $par = $bytes[$offset]; $offset += 1
    $salt = $bytes[$offset..($offset+15)]; $offset += 16
    $pwWrapped = $bytes[$offset..($offset+59)]; $offset += 60
    $rcWrapped = $bytes[$offset..($offset+59)]; $offset += 60
    $payload = $bytes[$offset..($bytes.Length-1)]
    return @{
        MemoryKB = $memKB; Iterations = $iters; Parallelism = $par
        Salt = $salt; PasswordWrappedDEK = $pwWrapped; RecoveryWrappedDEK = $rcWrapped
        EncryptedPayload = $payload
    }
}

# --- Tar helpers (uses GNU tar from Git Bash) ---

$GIT_BASH = "C:\Program Files\Git\bin\bash.exe"

function Pack-TarGz([string]$SourceDir, [string]$OutputFile) {
    # IMPORTANT: Exclude .* dotfiles (state files like .dek-cache, .unlocked,
    # .dirty, .last-access, .watchdog-pid, .lock-in-progress) to prevent
    # sensitive state data from being included in the encrypted vault.
    $src = $SourceDir -replace '\\','/'
    $out = $OutputFile -replace '\\','/'
    & $GIT_BASH -c "cd '$src' && tar czf '$out' --exclude='./.*' ."
    if ($LASTEXITCODE -ne 0) { throw "tar pack failed" }
}

function Unpack-TarGz([string]$TarFile, [string]$DestDir) {
    $tar = $TarFile -replace '\\','/'
    $dst = $DestDir -replace '\\','/'
    & $GIT_BASH -c "mkdir -p '$dst' && tar xzf '$tar' -C '$dst'"
    if ($LASTEXITCODE -ne 0) { throw "tar unpack failed" }
}

# --- WPF Dialogs ---

function Show-UnlockDialog {
    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Journal" SizeToContent="WidthAndHeight" WindowStartupLocation="CenterScreen"
        ResizeMode="NoResize" Topmost="True" Background="#1a1a2e" WindowStyle="None"
        AllowsTransparency="True">
    <Border CornerRadius="12" Background="#1a1a2e" BorderBrush="#3a3a5c" BorderThickness="1" Padding="32">
        <StackPanel Width="320">
            <TextBlock Text="&#x1F512;" FontSize="32" HorizontalAlignment="Center" Margin="0,0,0,8"/>
            <TextBlock Text="Journal Unlock" FontSize="20" FontWeight="SemiBold" Foreground="#e0e0ff" HorizontalAlignment="Center" Margin="0,0,0,4"/>
            <TextBlock Text="Enter your password to access journal files" FontSize="12" Foreground="#8888aa" HorizontalAlignment="Center" Margin="0,0,0,20" TextWrapping="Wrap"/>
            <PasswordBox Name="PasswordInput" FontSize="14" Padding="10,8" Background="#2a2a4a" Foreground="#e0e0ff" BorderBrush="#3a3a5c" BorderThickness="1"/>
            <TextBlock Name="ErrorText" Text="" FontSize="11" Foreground="#ff6b6b" HorizontalAlignment="Center" Margin="0,8,0,0"/>
            <Button Name="UnlockBtn" Content="Unlock" FontSize="14" FontWeight="SemiBold" Padding="10,8" Margin="0,12,0,0" Background="#4a4ae0" Foreground="White" BorderThickness="0" Cursor="Hand"/>
            <Button Name="CancelBtn" Content="Cancel" FontSize="12" Padding="8,6" Margin="0,8,0,0" Background="Transparent" Foreground="#8888aa" BorderThickness="0" Cursor="Hand"/>
        </StackPanel>
    </Border>
</Window>
"@
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $pwBox = $window.FindName("PasswordInput")
    $unlockBtn = $window.FindName("UnlockBtn")
    $cancelBtn = $window.FindName("CancelBtn")
    $errorText = $window.FindName("ErrorText")

    $script:dialogResult = $null
    $unlockBtn.Add_Click({
        if ($pwBox.Password) { $script:dialogResult = $pwBox.Password; $window.Close() }
        else { $errorText.Text = "Password required" }
    })
    $cancelBtn.Add_Click({ $window.Close() })
    $window.Add_KeyDown({ if ($_.Key -eq "Escape") { $window.Close() } })
    $window.Add_ContentRendered({ $pwBox.Focus() })
    $window.ShowDialog() | Out-Null
    return $script:dialogResult
}

function Show-SetupDialog {
    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Journal" SizeToContent="WidthAndHeight" WindowStartupLocation="CenterScreen"
        ResizeMode="NoResize" Topmost="True" Background="#1a1a2e" WindowStyle="None"
        AllowsTransparency="True">
    <Border CornerRadius="12" Background="#1a1a2e" BorderBrush="#3a3a5c" BorderThickness="1" Padding="32">
        <StackPanel Width="320">
            <TextBlock Text="&#x1F6E1;" FontSize="32" HorizontalAlignment="Center" Margin="0,0,0,8"/>
            <TextBlock Text="Set Journal Password" FontSize="20" FontWeight="SemiBold" Foreground="#e0e0ff" HorizontalAlignment="Center" Margin="0,0,0,4"/>
            <TextBlock Text="Choose a password to protect your journal" FontSize="12" Foreground="#8888aa" HorizontalAlignment="Center" Margin="0,0,0,20" TextWrapping="Wrap"/>
            <TextBlock Text="Password" FontSize="11" Foreground="#8888aa" Margin="0,0,0,4"/>
            <PasswordBox Name="Password1" FontSize="14" Padding="10,8" Background="#2a2a4a" Foreground="#e0e0ff" BorderBrush="#3a3a5c" BorderThickness="1"/>
            <TextBlock Text="Confirm" FontSize="11" Foreground="#8888aa" Margin="0,12,0,4"/>
            <PasswordBox Name="Password2" FontSize="14" Padding="10,8" Background="#2a2a4a" Foreground="#e0e0ff" BorderBrush="#3a3a5c" BorderThickness="1"/>
            <TextBlock Name="ErrorText" Text="" FontSize="11" Foreground="#ff6b6b" HorizontalAlignment="Center" Margin="0,8,0,0"/>
            <Button Name="CreateBtn" Content="Create Vault" FontSize="14" FontWeight="SemiBold" Padding="10,8" Margin="0,12,0,0" Background="#4a4ae0" Foreground="White" BorderThickness="0" Cursor="Hand"/>
            <Button Name="CancelBtn" Content="Cancel" FontSize="12" Padding="8,6" Margin="0,8,0,0" Background="Transparent" Foreground="#8888aa" BorderThickness="0" Cursor="Hand"/>
        </StackPanel>
    </Border>
</Window>
"@
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $pw1 = $window.FindName("Password1")
    $pw2 = $window.FindName("Password2")
    $createBtn = $window.FindName("CreateBtn")
    $cancelBtn = $window.FindName("CancelBtn")
    $errorText = $window.FindName("ErrorText")

    $script:dialogResult = $null
    $createBtn.Add_Click({
        if (-not $pw1.Password) { $errorText.Text = "Password required"; return }
        if ($pw1.Password.Length -lt 8) { $errorText.Text = "Minimum 8 characters"; return }
        if ($pw1.Password -ne $pw2.Password) { $errorText.Text = "Passwords do not match"; return }
        $script:dialogResult = $pw1.Password; $window.Close()
    })
    $cancelBtn.Add_Click({ $window.Close() })
    $window.Add_KeyDown({ if ($_.Key -eq "Escape") { $window.Close() } })
    $window.Add_ContentRendered({ $pw1.Focus() })
    $window.ShowDialog() | Out-Null
    return $script:dialogResult
}

function Show-RecoveryKeyDialog([string]$RecoveryKeyBase64) {
    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Journal" SizeToContent="WidthAndHeight" WindowStartupLocation="CenterScreen"
        ResizeMode="NoResize" Topmost="True" Background="#1a1a2e" WindowStyle="None"
        AllowsTransparency="True">
    <Border CornerRadius="12" Background="#1a1a2e" BorderBrush="#3a3a5c" BorderThickness="1" Padding="32">
        <StackPanel Width="400">
            <TextBlock Text="&#x1F511;" FontSize="32" HorizontalAlignment="Center" Margin="0,0,0,8"/>
            <TextBlock Text="Recovery Key" FontSize="20" FontWeight="SemiBold" Foreground="#e0e0ff" HorizontalAlignment="Center" Margin="0,0,0,4"/>
            <TextBlock Text="Store this somewhere safe. If you forget your password, this is the only way to recover your journal." FontSize="12" Foreground="#ff9966" HorizontalAlignment="Center" Margin="0,0,0,16" TextWrapping="Wrap"/>
            <TextBox Name="KeyDisplay" Text="" FontSize="13" FontFamily="Consolas" Padding="10,8" Background="#2a2a4a" Foreground="#e0e0ff" BorderBrush="#3a3a5c" BorderThickness="1" IsReadOnly="True" TextWrapping="Wrap"/>
            <Button Name="CopyBtn" Content="Copy to Clipboard" FontSize="12" Padding="8,6" Margin="0,12,0,0" Background="#3a3a5c" Foreground="#e0e0ff" BorderThickness="0" Cursor="Hand"/>
            <CheckBox Name="SavedCheck" Content="I have saved my recovery key" FontSize="12" Foreground="#8888aa" Margin="0,12,0,0"/>
            <Button Name="DoneBtn" Content="Done" FontSize="14" FontWeight="SemiBold" Padding="10,8" Margin="0,12,0,0" Background="#4a4ae0" Foreground="White" BorderThickness="0" Cursor="Hand" IsEnabled="False"/>
        </StackPanel>
    </Border>
</Window>
"@
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $copyBtn = $window.FindName("CopyBtn")
    $savedCheck = $window.FindName("SavedCheck")
    $doneBtn = $window.FindName("DoneBtn")

    $keyDisplay = $window.FindName("KeyDisplay")
    $keyDisplay.Text = $RecoveryKeyBase64  # Set programmatically, not via XAML interpolation
    $copyBtn.Add_Click({ [System.Windows.Clipboard]::SetText($RecoveryKeyBase64) })
    $savedCheck.Add_Checked({ $doneBtn.IsEnabled = $true })
    $savedCheck.Add_Unchecked({ $doneBtn.IsEnabled = $false })
    $doneBtn.Add_Click({ $window.Close() })
    $window.Add_KeyDown({ if ($_.Key -eq "Escape") { $window.Close() } })
    $window.ShowDialog() | Out-Null
}

function Show-RecoveryDialog {
    $xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Journal" SizeToContent="WidthAndHeight" WindowStartupLocation="CenterScreen"
        ResizeMode="NoResize" Topmost="True" Background="#1a1a2e" WindowStyle="None"
        AllowsTransparency="True">
    <Border CornerRadius="12" Background="#1a1a2e" BorderBrush="#3a3a5c" BorderThickness="1" Padding="32">
        <StackPanel Width="400">
            <TextBlock Text="&#x1F504;" FontSize="32" HorizontalAlignment="Center" Margin="0,0,0,8"/>
            <TextBlock Text="Journal Recovery" FontSize="20" FontWeight="SemiBold" Foreground="#e0e0ff" HorizontalAlignment="Center" Margin="0,0,0,4"/>
            <TextBlock Text="Paste your recovery key to regain access" FontSize="12" Foreground="#8888aa" HorizontalAlignment="Center" Margin="0,0,0,20" TextWrapping="Wrap"/>
            <TextBox Name="RecoveryInput" FontSize="13" FontFamily="Consolas" Padding="10,8" Background="#2a2a4a" Foreground="#e0e0ff" BorderBrush="#3a3a5c" BorderThickness="1" TextWrapping="Wrap" AcceptsReturn="False" Height="60"/>
            <TextBlock Name="ErrorText" Text="" FontSize="11" Foreground="#ff6b6b" HorizontalAlignment="Center" Margin="0,8,0,0"/>
            <Button Name="RecoverBtn" Content="Recover" FontSize="14" FontWeight="SemiBold" Padding="10,8" Margin="0,12,0,0" Background="#4a4ae0" Foreground="White" BorderThickness="0" Cursor="Hand"/>
            <Button Name="CancelBtn" Content="Cancel" FontSize="12" Padding="8,6" Margin="0,8,0,0" Background="Transparent" Foreground="#8888aa" BorderThickness="0" Cursor="Hand"/>
        </StackPanel>
    </Border>
</Window>
"@
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
    $window = [System.Windows.Markup.XamlReader]::Load($reader)
    $input = $window.FindName("RecoveryInput")
    $recoverBtn = $window.FindName("RecoverBtn")
    $cancelBtn = $window.FindName("CancelBtn")
    $errorText = $window.FindName("ErrorText")

    $script:dialogResult = $null
    $recoverBtn.Add_Click({
        $key = $input.Text.Trim()
        if (-not $key) { $errorText.Text = "Recovery key required"; return }
        try { [Convert]::FromBase64String($key) | Out-Null } catch { $errorText.Text = "Invalid base64"; return }
        $script:dialogResult = $key; $window.Close()
    })
    $cancelBtn.Add_Click({ $window.Close() })
    $window.Add_KeyDown({ if ($_.Key -eq "Escape") { $window.Close() } })
    $window.Add_ContentRendered({ $input.Focus() })
    $window.ShowDialog() | Out-Null
    return $script:dialogResult
}

# --- Commands ---

function Invoke-Init {
    # Check if vault already exists
    $remotePath = $Config.vault_remote_path
    $rcloneCheck = & rclone lsf $remotePath 2>&1
    if ($LASTEXITCODE -eq 0 -and $rcloneCheck) {
        Write-Output "ERROR: Vault already exists at $remotePath"
        exit 1
    }

    # Show setup dialog
    $password = Show-SetupDialog
    if (-not $password) { Write-Output "CANCELLED"; exit 1 }

    # Generate DEK and recovery key
    $dek = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($dek)
    $recoveryKey = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($recoveryKey)
    $salt = [byte[]]::new(16)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)

    # Derive password key and wrap DEK
    $pwBytes = [System.Text.Encoding]::UTF8.GetBytes($password)
    $pwKey = Derive-Key $pwBytes $salt
    $pwWrapped = Wrap-DEK $pwKey $dek
    $rcWrapped = Wrap-DEK $recoveryKey $dek

    # Download existing journal files (if any)
    $journalBase = ($remotePath -replace '/journal-vault\.enc$', '')
    $tempDownload = "$env:TEMP\journal-vault-migration-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDownload -Force | Out-Null

    Write-Output "Downloading existing journal files..."
    & rclone copy "$journalBase/" "$tempDownload/" 2>&1 | Out-Null

    # Create pre-encryption backup
    $backupPath = $journalBase -replace 'The Journal$', 'The Journal (Pre-Encryption Backup)'
    Write-Output "Creating pre-encryption backup at $backupPath..."
    & rclone copy "$journalBase/" "$backupPath/" 2>&1 | Out-Null

    # Pack into tar.gz
    $tarFile = "$env:TEMP\journal-vault-$(Get-Random).tar.gz"
    if ((Get-ChildItem $tempDownload -Recurse -File).Count -gt 0) {
        Pack-TarGz $tempDownload $tarFile
    } else {
        # Empty vault — create minimal tar.gz
        $emptyDir = "$env:TEMP\journal-vault-empty-$(Get-Random)"
        New-Item -ItemType Directory "$emptyDir\Daily Entries" -Force | Out-Null
        New-Item -ItemType Directory "$emptyDir\Misc. Entries and Information" -Force | Out-Null
        New-Item -ItemType Directory "$emptyDir\System" -Force | Out-Null
        New-Item -ItemType Directory "$emptyDir\Encyclopedia Archive" -Force | Out-Null
        Pack-TarGz $emptyDir $tarFile
        Remove-Item -Recurse -Force $emptyDir
    }

    # Encrypt
    $tarBytes = [System.IO.File]::ReadAllBytes($tarFile)
    $encrypted = AesGcm-Encrypt $dek $tarBytes

    # Write vault file locally
    $localVault = "$env:TEMP\journal-vault.enc"
    Write-VaultFile $localVault $salt $pwWrapped $rcWrapped $encrypted

    # Upload to Drive
    Write-Output "Uploading encrypted vault..."
    & rclone copyto $localVault $remotePath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "ERROR: Failed to upload vault to $remotePath"
        exit 1
    }

    # Delete all plaintext from Drive (but keep backup and the new vault)
    Write-Output "Removing plaintext files from Drive..."
    # Delete everything under The Journal/ except the vault file and vault-history/
    & rclone delete "$journalBase/" --exclude "journal-vault.enc" --exclude "vault-history/**" 2>&1 | Out-Null
    # Remove now-empty subdirectories
    & rclone rmdirs "$journalBase/" --leave-root 2>&1 | Out-Null

    # Clean up temp files
    Remove-Item -Force $tarFile, $localVault -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $tempDownload -ErrorAction SilentlyContinue

    # Show recovery key
    $recoveryKeyBase64 = [Convert]::ToBase64String($recoveryKey)
    Show-RecoveryKeyDialog $recoveryKeyBase64

    # Create default config
    if (-not (Test-Path $CONFIG_FILE)) {
        @{ timeout_minutes = 15; vault_history_count = 10; vault_remote_path = $remotePath } |
            ConvertTo-Json | Set-Content $CONFIG_FILE
    }

    Write-Output "INIT_SUCCESS"
}

function Invoke-Unlock {
    # Already unlocked?
    if (Test-Path "$VAULT_TEMP\.unlocked") {
        # Touch last-access and return
        (Get-Item "$VAULT_TEMP\.last-access").LastWriteTime = Get-Date
        Write-Output "ALREADY_UNLOCKED:$VAULT_TEMP"
        exit 0
    }

    # Download vault
    $remotePath = $Config.vault_remote_path
    $localVault = "$env:TEMP\journal-vault-dl-$(Get-Random).enc"
    & rclone copyto $remotePath $localVault 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $localVault)) {
        Write-Output "ERROR: Could not download vault from $remotePath"
        exit 1
    }

    # Read vault header
    $vault = Read-VaultFile $localVault

    # Show unlock dialog and try to decrypt
    $maxAttempts = 3
    for ($i = 0; $i -lt $maxAttempts; $i++) {
        $password = Show-UnlockDialog
        if (-not $password) {
            Remove-Item -Force $localVault -ErrorAction SilentlyContinue
            Write-Output "CANCELLED"
            exit 1
        }

        try {
            $pwBytes = [System.Text.Encoding]::UTF8.GetBytes($password)
            # Use vault's stored Argon2 params
            $script:ARGON2_MEMORY_KB = $vault.MemoryKB
            $script:ARGON2_ITERATIONS = $vault.Iterations
            $script:ARGON2_PARALLELISM = $vault.Parallelism
            $pwKey = Derive-Key $pwBytes ([byte[]]$vault.Salt)
            $dek = Unwrap-DEK $pwKey ([byte[]]$vault.PasswordWrappedDEK)
            $tarBytes = AesGcm-Decrypt $dek ([byte[]]$vault.EncryptedPayload)
            break
        } catch {
            if ($i -eq $maxAttempts - 1) {
                Remove-Item -Force $localVault -ErrorAction SilentlyContinue
                Write-Output "ERROR: Max attempts exceeded"
                exit 1
            }
            # Will retry — dialog shows again
        }
    }

    # Extract to temp dir
    $tarFile = "$env:TEMP\journal-vault-$(Get-Random).tar.gz"
    [System.IO.File]::WriteAllBytes($tarFile, $tarBytes)

    if (Test-Path $VAULT_TEMP) { Remove-Item -Recurse -Force $VAULT_TEMP }
    New-Item -ItemType Directory -Path $VAULT_TEMP -Force | Out-Null
    Unpack-TarGz $tarFile $VAULT_TEMP

    # DEK cache write — AFTER Unpack-TarGz (VAULT_TEMP directory must exist first)
    [System.IO.File]::WriteAllBytes("$VAULT_TEMP\.dek-cache", $dek)

    # Create state files
    "" | Set-Content "$VAULT_TEMP\.unlocked"
    (Get-Date).ToString("o") | Set-Content "$VAULT_TEMP\.last-access"

    # Populate encyclopedia cache
    $encDir = "$CLAUDE_DIR\encyclopedia"
    if (Test-Path "$VAULT_TEMP\System") {
        New-Item -ItemType Directory -Path $encDir -Force | Out-Null
        Copy-Item "$VAULT_TEMP\System\*" $encDir -Recurse -Force
    }

    # Start watchdog (Start-Process already runs asynchronously — no & needed)
    # The watchdog script writes its own PID to .watchdog-pid
    $watchdogPath = "$PSScriptRoot\journal-vault-watchdog.sh"
    $watchdogPath_unix = $watchdogPath -replace '\\','/'
    $vaultTempUnix = $VAULT_TEMP -replace '\\','/'
    $timeoutMin = $Config.timeout_minutes
    Start-Process -FilePath "C:\Program Files\Git\bin\bash.exe" `
        -ArgumentList "-c", "`"$watchdogPath_unix`" `"$vaultTempUnix`" $timeoutMin" `
        -WindowStyle Hidden

    # Clean up
    Remove-Item -Force $tarFile, $localVault -ErrorAction SilentlyContinue

    Write-Output "UNLOCKED:$VAULT_TEMP"
}

function Invoke-Lock {
    if (-not (Test-Path "$VAULT_TEMP\.unlocked")) {
        Write-Output "NOT_UNLOCKED"
        exit 0
    }

    $remotePath = $Config.vault_remote_path
    $isDirty = Test-Path "$VAULT_TEMP\.dirty"

    if ($isDirty) {
        # Re-encrypt and upload
        Write-Output "Re-encrypting vault..."

        # Download current vault to get header (salt, wrapped DEKs)
        $localVault = "$env:TEMP\journal-vault-reenc-$(Get-Random).enc"
        & rclone copyto $remotePath $localVault 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $localVault)) {
            Write-Output "ERROR: Could not download vault for re-encryption. Temp dir preserved at $VAULT_TEMP for manual recovery."
            exit 1
        }
        $vault = Read-VaultFile $localVault

        # We need the DEK — but we don't have the password anymore.
        # Store the DEK (encrypted) in the temp dir during unlock.
        $dekFile = "$VAULT_TEMP\.dek-cache"
        if (-not (Test-Path $dekFile)) {
            Write-Output "ERROR: No cached DEK — cannot re-encrypt. Data preserved in $VAULT_TEMP"
            exit 1
        }
        $dek = [System.IO.File]::ReadAllBytes($dekFile)

        # Sync encyclopedia cache changes back to vault temp
        $encDir = "$CLAUDE_DIR\encyclopedia"
        if (Test-Path $encDir) {
            Copy-Item "$encDir\*" "$VAULT_TEMP\System\" -Recurse -Force -ErrorAction SilentlyContinue
        }

        # Pack and encrypt
        $tarFile = "$env:TEMP\journal-vault-repack-$(Get-Random).tar.gz"
        Pack-TarGz $VAULT_TEMP $tarFile
        $tarBytes = [System.IO.File]::ReadAllBytes($tarFile)
        $encrypted = AesGcm-Encrypt $dek $tarBytes

        # Move old vault to history
        $historyCount = $Config.vault_history_count
        $historyBase = ($remotePath -replace 'journal-vault\.enc$', 'vault-history/')
        $timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
        & rclone moveto $remotePath "$historyBase/journal-vault-$timestamp.enc" 2>&1 | Out-Null

        # Prune old history
        $historyFiles = & rclone lsf "$historyBase" --files-only 2>&1 | Sort-Object
        if ($historyFiles.Count -gt $historyCount) {
            $toDelete = $historyFiles | Select-Object -First ($historyFiles.Count - $historyCount)
            foreach ($f in $toDelete) {
                & rclone delete "$historyBase$f" 2>&1 | Out-Null
            }
        }

        # Upload new vault
        $newVault = "$env:TEMP\journal-vault-new-$(Get-Random).enc"
        Write-VaultFile $newVault ([byte[]]$vault.Salt) ([byte[]]$vault.PasswordWrappedDEK) ([byte[]]$vault.RecoveryWrappedDEK) $encrypted
        & rclone copyto $newVault $remotePath 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Output "ERROR: Failed to upload vault. New vault preserved at $newVault, temp dir at $VAULT_TEMP."
            exit 1
        }

        # Clean up temp encryption files
        Remove-Item -Force $tarFile, $localVault, $newVault -ErrorAction SilentlyContinue
    }

    # Kill watchdog (use $wdPid to avoid shadowing automatic $PID variable)
    $pidFile = "$VAULT_TEMP\.watchdog-pid"
    if (Test-Path $pidFile) {
        $wdPid = Get-Content $pidFile
        Stop-Process -Id $wdPid -Force -ErrorAction SilentlyContinue
    }

    # Wipe temp dir
    Remove-Item -Recurse -Force $VAULT_TEMP -ErrorAction SilentlyContinue

    # Wipe encyclopedia cache
    $encDir = "$CLAUDE_DIR\encyclopedia"
    if (Test-Path $encDir) {
        Remove-Item -Recurse -Force "$encDir\*" -ErrorAction SilentlyContinue
    }

    Write-Output "LOCKED"
}

function Invoke-Status {
    if (Test-Path "$VAULT_TEMP\.unlocked") {
        $lastAccess = Get-Content "$VAULT_TEMP\.last-access"
        $isDirty = Test-Path "$VAULT_TEMP\.dirty"
        Write-Output "UNLOCKED|$VAULT_TEMP|$lastAccess|dirty=$isDirty"
    } else {
        # Check if vault exists on remote
        $remotePath = $Config.vault_remote_path
        $exists = & rclone lsf $remotePath 2>&1
        if ($LASTEXITCODE -eq 0 -and $exists) {
            Write-Output "LOCKED|vault_exists"
        } else {
            Write-Output "NO_VAULT"
        }
    }
}

function Invoke-ChangePassword {
    # Must be unlocked (we need the current DEK)
    if (-not (Test-Path "$VAULT_TEMP\.unlocked")) {
        Write-Output "ERROR: Vault must be unlocked first"
        exit 1
    }

    $dekFile = "$VAULT_TEMP\.dek-cache"
    if (-not (Test-Path $dekFile)) { Write-Output "ERROR: No cached DEK"; exit 1 }
    $dek = [System.IO.File]::ReadAllBytes($dekFile)

    # Prompt for new password via setup dialog
    $newPassword = Show-SetupDialog
    if (-not $newPassword) { Write-Output "CANCELLED"; exit 1 }

    # Download vault, re-wrap DEK with new password, upload
    $remotePath = $Config.vault_remote_path
    $localVault = "$env:TEMP\journal-vault-chpw-$(Get-Random).enc"
    & rclone copyto $remotePath $localVault 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Could not download vault"; exit 1 }
    $vault = Read-VaultFile $localVault

    $salt = [byte[]]::new(16)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)
    $pwBytes = [System.Text.Encoding]::UTF8.GetBytes($newPassword)
    $pwKey = Derive-Key $pwBytes $salt
    $newPwWrapped = Wrap-DEK $pwKey $dek

    Write-VaultFile $localVault $salt $newPwWrapped ([byte[]]$vault.RecoveryWrappedDEK) ([byte[]]$vault.EncryptedPayload)
    & rclone copyto $localVault $remotePath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Failed to upload vault after password change"; exit 1 }
    Remove-Item -Force $localVault

    Write-Output "PASSWORD_CHANGED"
}

function Invoke-Recover {
    $recoveryKeyB64 = Show-RecoveryDialog
    if (-not $recoveryKeyB64) { Write-Output "CANCELLED"; exit 1 }

    $recoveryKey = [Convert]::FromBase64String($recoveryKeyB64)

    $remotePath = $Config.vault_remote_path
    $localVault = "$env:TEMP\journal-vault-recover-$(Get-Random).enc"
    & rclone copyto $remotePath $localVault 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Could not download vault"; exit 1 }

    $vault = Read-VaultFile $localVault

    try {
        $dek = Unwrap-DEK $recoveryKey ([byte[]]$vault.RecoveryWrappedDEK)
    } catch {
        Remove-Item -Force $localVault
        Write-Output "ERROR: Invalid recovery key"
        exit 1
    }

    # Preserve the vault's stored Argon2 params
    $script:ARGON2_MEMORY_KB = $vault.MemoryKB
    $script:ARGON2_ITERATIONS = $vault.Iterations
    $script:ARGON2_PARALLELISM = $vault.Parallelism

    # Set new password
    $newPassword = Show-SetupDialog
    if (-not $newPassword) { Remove-Item -Force $localVault; Write-Output "CANCELLED"; exit 1 }

    $salt = [byte[]]::new(16)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)
    $pwBytes = [System.Text.Encoding]::UTF8.GetBytes($newPassword)
    $pwKey = Derive-Key $pwBytes $salt
    $newPwWrapped = Wrap-DEK $pwKey $dek

    Write-VaultFile $localVault $salt $newPwWrapped ([byte[]]$vault.RecoveryWrappedDEK) ([byte[]]$vault.EncryptedPayload)
    & rclone copyto $localVault $remotePath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Failed to upload vault after recovery"; exit 1 }
    Remove-Item -Force $localVault

    Write-Output "RECOVERED"
}

function Invoke-RotateRecovery {
    if (-not (Test-Path "$VAULT_TEMP\.unlocked")) {
        Write-Output "ERROR: Vault must be unlocked first"
        exit 1
    }

    $dekFile = "$VAULT_TEMP\.dek-cache"
    if (-not (Test-Path $dekFile)) { Write-Output "ERROR: No cached DEK"; exit 1 }
    $dek = [System.IO.File]::ReadAllBytes($dekFile)

    $newRecoveryKey = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($newRecoveryKey)
    $newRcWrapped = Wrap-DEK $newRecoveryKey $dek

    $remotePath = $Config.vault_remote_path
    $localVault = "$env:TEMP\journal-vault-rotrc-$(Get-Random).enc"
    & rclone copyto $remotePath $localVault 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Could not download vault"; exit 1 }
    $vault = Read-VaultFile $localVault

    # Preserve the vault's stored Argon2 params (do not overwrite with defaults)
    $script:ARGON2_MEMORY_KB = $vault.MemoryKB
    $script:ARGON2_ITERATIONS = $vault.Iterations
    $script:ARGON2_PARALLELISM = $vault.Parallelism

    Write-VaultFile $localVault ([byte[]]$vault.Salt) ([byte[]]$vault.PasswordWrappedDEK) $newRcWrapped ([byte[]]$vault.EncryptedPayload)
    & rclone copyto $localVault $remotePath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output "ERROR: Failed to upload vault after recovery key rotation"; exit 1 }
    Remove-Item -Force $localVault

    $newRecoveryKeyB64 = [Convert]::ToBase64String($newRecoveryKey)
    Show-RecoveryKeyDialog $newRecoveryKeyB64

    Write-Output "RECOVERY_ROTATED"
}

# --- Main dispatcher ---
switch ($Command) {
    "init"              { Invoke-Init }
    "unlock"            { Invoke-Unlock }
    "lock"              { Invoke-Lock }
    "status"            { Invoke-Status }
    "change-password"   { Invoke-ChangePassword }
    "recover"           { Invoke-Recover }
    "rotate-recovery"   { Invoke-RotateRecovery }
}
