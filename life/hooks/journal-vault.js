'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { spawn } = require('child_process');

// ─── Constants ──────────────────────────────────────────────────────────────

const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude');
const VAULT_STATE_DIR = path.join(CLAUDE_DIR, '.vault-state');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'toolkit-state', 'config.json');
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const DEFAULT_SCRYPT_PARAMS = { N: 65536, r: 8, p: 1 };
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const DEK_LENGTH = 32;
const JOURNAL_DIR = process.env.JOURNAL_DIR || 'journals';

// ─── Task 1: Crypto Primitives ─────────────────────────────────────────────

/**
 * Derive a 32-byte key from a password using scrypt.
 * @param {string} password
 * @param {Buffer} salt - 16-byte salt
 * @param {object} params - { N, r, p }
 * @returns {Promise<Buffer>} 32-byte derived key
 */
function deriveKey(password, salt, params) {
  const { N, r, p } = params || DEFAULT_SCRYPT_PARAMS;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, DEK_LENGTH, { N, r, p, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) return reject(err);
      resolve(key);
    });
  });
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * @param {Buffer} key - 32-byte key
 * @param {Buffer} plaintext
 * @returns {Buffer} iv(12) + ciphertext + tag(16)
 */
function aesGcmEncrypt(key, plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Decrypt an AES-256-GCM blob.
 * @param {Buffer} key - 32-byte key
 * @param {Buffer} blob - iv(12) + ciphertext + tag(16)
 * @returns {Buffer} plaintext
 */
function aesGcmDecrypt(key, blob) {
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH, blob.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Wrap a DEK with a wrapping key (AES-256-GCM envelope).
 * @param {Buffer} wrappingKey - 32-byte key derived from password or recovery key
 * @param {Buffer} dek - 32-byte data encryption key
 * @returns {Buffer} wrapped DEK blob
 */
function wrapDEK(wrappingKey, dek) {
  return aesGcmEncrypt(wrappingKey, dek);
}

/**
 * Unwrap a DEK with a wrapping key.
 * @param {Buffer} wrappingKey - 32-byte key
 * @param {Buffer} wrappedDEK - wrapped DEK blob
 * @returns {Buffer} 32-byte DEK
 */
function unwrapDEK(wrappingKey, wrappedDEK) {
  return aesGcmDecrypt(wrappingKey, wrappedDEK);
}

// ─── Task 2: Password Prompt and Config Helpers ─────────────────────────────

/**
 * Prompt for a password with hidden input.
 * Uses readline with setRawMode to hide typed characters.
 * Prompt text goes to stderr; stdout stays clean.
 * @param {string} promptText
 * @returns {Promise<string>}
 */
function promptPassword(promptText) {
  return new Promise((resolve, reject) => {
    process.stderr.write(promptText);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (typeof stdin.setRawMode === 'function') {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (ch) => {
      // Handle Ctrl-C
      if (ch === '\u0003') {
        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(wasRaw || false);
        }
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stderr.write('\n');
        reject(new Error('User cancelled'));
        return;
      }
      // Handle Enter
      if (ch === '\r' || ch === '\n') {
        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(wasRaw || false);
        }
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(password);
        return;
      }
      // Handle Backspace
      if (ch === '\u007f' || ch === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stderr.write('\b \b');
        }
        return;
      }
      password += ch;
      process.stderr.write('*');
    };

    stdin.on('data', onData);
  });
}

/**
 * Prompt for a password twice and confirm they match.
 * @param {string} promptText
 * @returns {Promise<string>}
 */
async function promptPasswordConfirm(promptText) {
  const pw1 = await promptPassword(promptText);
  const pw2 = await promptPassword('Confirm password: ');
  if (pw1 !== pw2) {
    throw new Error('Passwords do not match');
  }
  return pw1;
}

/**
 * Read a value from the config file.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
function configGet(key, defaultValue) {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return key in config ? config[key] : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Write a value to the config file (atomic).
 * @param {string} key
 * @param {*} value
 */
function configSet(key, value) {
  const configDir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    // Start fresh
  }
  config[key] = value;
  const tmpFile = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmpFile, CONFIG_FILE);
}

/**
 * Path to vault-header.json.
 * @returns {string}
 */
function vaultHeaderPath() {
  return path.join(vaultDir(), 'vault-header.json');
}

/**
 * Path to the vault directory.
 * @returns {string}
 */
function vaultDir() {
  const remotePath = configGet('vault_remote_path', 'vault');
  return path.join(CLAUDE_DIR, remotePath);
}

/**
 * Compute the encrypted file path for a given relative source path.
 * e.g., "encyclopedia/Core Identity.md" -> "<vaultDir>/encyclopedia/Core Identity.md.enc"
 * @param {string} relativePath
 * @returns {string}
 */
function encPath(relativePath) {
  return path.join(vaultDir(), relativePath + '.enc');
}

/**
 * Ensure the directory for a file path exists.
 * @param {string} filePath
 */
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Task 3: File Encrypt/Decrypt and Manifest ─────────────────────────────

/**
 * Encrypt a file from srcPath to destPath.
 * @param {Buffer} dek - 32-byte data encryption key
 * @param {string} srcPath - path to plaintext file
 * @param {string} destPath - path to write encrypted file
 * @returns {number} plaintext size in bytes
 */
function encryptFile(dek, srcPath, destPath) {
  const plaintext = fs.readFileSync(srcPath);
  const blob = aesGcmEncrypt(dek, plaintext);
  ensureDir(destPath);
  fs.writeFileSync(destPath, blob);
  return plaintext.length;
}

/**
 * Decrypt a file from srcPath to destPath.
 * @param {Buffer} dek - 32-byte data encryption key
 * @param {string} srcPath - path to encrypted file
 * @param {string} destPath - path to write plaintext file
 * @returns {number} plaintext size in bytes
 */
function decryptFile(dek, srcPath, destPath) {
  const blob = fs.readFileSync(srcPath);
  const plaintext = aesGcmDecrypt(dek, blob);
  ensureDir(destPath);
  fs.writeFileSync(destPath, plaintext);
  return plaintext.length;
}

/**
 * Build a manifest object from an array of file entries.
 * @param {Array<{relativePath: string, size: number}>} fileEntries
 * @returns {object} manifest object
 */
function buildManifest(fileEntries) {
  const files = {};
  for (const entry of fileEntries) {
    files[entry.relativePath] = { size: entry.size };
  }
  return { version: 1, files };
}

/**
 * Encrypt and write the manifest to the vault directory.
 * @param {Buffer} dek
 * @param {object} manifest
 */
function encryptManifest(dek, manifest) {
  const plaintext = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  const blob = aesGcmEncrypt(dek, plaintext);
  const manifestPath = path.join(vaultDir(), 'manifest.enc');
  ensureDir(manifestPath);
  fs.writeFileSync(manifestPath, blob);
}

/**
 * Decrypt and read the manifest from the vault directory.
 * @param {Buffer} dek
 * @returns {object} manifest object
 */
function decryptManifest(dek) {
  const manifestPath = path.join(vaultDir(), 'manifest.enc');
  const blob = fs.readFileSync(manifestPath);
  const plaintext = aesGcmDecrypt(dek, blob);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Discover source files eligible for encryption.
 * Scans encyclopedia/*.md and journals/*.md under CLAUDE_DIR.
 * @returns {Array<{relativePath: string, absolutePath: string}>}
 */
function discoverSourceFiles() {
  const results = [];

  const encyclopediaDir = path.join(CLAUDE_DIR, 'encyclopedia');
  if (fs.existsSync(encyclopediaDir)) {
    const files = fs.readdirSync(encyclopediaDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        results.push({
          relativePath: path.join('encyclopedia', file),
          absolutePath: path.join(encyclopediaDir, file),
        });
      }
    }
  }

  const journalsDir = path.join(CLAUDE_DIR, JOURNAL_DIR);
  if (fs.existsSync(journalsDir)) {
    const files = fs.readdirSync(journalsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        results.push({
          relativePath: path.join(JOURNAL_DIR, file),
          absolutePath: path.join(journalsDir, file),
        });
      }
    }
  }

  return results;
}

// ─── Task 4: Init Command ──────────────────────────────────────────────────

/**
 * First-time vault initialization.
 * Generates DEK + recovery key, prompts for password, encrypts all files,
 * writes vault-header.json, displays recovery key.
 */
async function cmdInit() {
  // Check if already initialized
  const headerPath = vaultHeaderPath();
  if (fs.existsSync(headerPath)) {
    process.stderr.write('Vault is already initialized.\n');
    process.exit(1);
  }

  // Generate DEK (data encryption key) and recovery key
  const dek = crypto.randomBytes(DEK_LENGTH);
  const recoveryKey = crypto.randomBytes(DEK_LENGTH);

  // Prompt for password
  const password = await promptPasswordConfirm('Enter vault password: ');
  if (!password) {
    process.stderr.write('Password cannot be empty.\n');
    process.exit(1);
  }

  // Derive wrapping key from password
  const salt = crypto.randomBytes(SALT_LENGTH);
  const wrappingKey = await deriveKey(password, salt, DEFAULT_SCRYPT_PARAMS);

  // Wrap DEK with password-derived key
  const wrappedDEK = wrapDEK(wrappingKey, dek);

  // Wrap DEK with recovery key (use recovery key directly as wrapping key — 32 bytes)
  const recoveryWrappedDEK = wrapDEK(recoveryKey, dek);

  // Discover and encrypt files
  const sourceFiles = discoverSourceFiles();
  const fileEntries = [];

  for (const file of sourceFiles) {
    const dest = encPath(file.relativePath);
    const size = encryptFile(dek, file.absolutePath, dest);
    fileEntries.push({ relativePath: file.relativePath, size });
    process.stderr.write(`  Encrypted: ${file.relativePath}\n`);
  }

  // Build and encrypt manifest
  const manifest = buildManifest(fileEntries);
  encryptManifest(dek, manifest);

  // Write vault header
  const header = {
    version: 1,
    kdf: {
      algorithm: 'scrypt',
      N: DEFAULT_SCRYPT_PARAMS.N,
      r: DEFAULT_SCRYPT_PARAMS.r,
      p: DEFAULT_SCRYPT_PARAMS.p,
    },
    salt: salt.toString('base64'),
    wrappedDEK: wrappedDEK.toString('base64'),
    recoveryWrappedDEK: recoveryWrappedDEK.toString('base64'),
  };
  ensureDir(headerPath);
  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2), 'utf8');

  // Create .vault-state and mark as unlocked (files are still local)
  if (!fs.existsSync(VAULT_STATE_DIR)) {
    fs.mkdirSync(VAULT_STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(VAULT_STATE_DIR, '.unlocked'), '', 'utf8');

  // Cache DEK for lock/unlock cycle
  fs.writeFileSync(path.join(VAULT_STATE_DIR, '.dek'), dek.toString('base64'), 'utf8');

  // Set config
  configSet('vault_enabled', true);

  // Display recovery key
  process.stderr.write('\n========================================\n');
  process.stderr.write('RECOVERY KEY — SAVE THIS SOMEWHERE SAFE:\n');
  process.stderr.write(recoveryKey.toString('base64') + '\n');
  process.stderr.write('========================================\n');
  process.stderr.write('\nVault initialized with ' + sourceFiles.length + ' files.\n');

  // Machine-readable status to stdout
  process.stdout.write('INITIALIZED\n');
}

// ─── Task 5: Unlock and Lock Commands ──────────────────────────────────────

/**
 * Unlock the vault: decrypt all files to their standard local paths.
 */
async function cmdUnlock() {
  // Check if already unlocked
  if (fs.existsSync(path.join(VAULT_STATE_DIR, '.unlocked'))) {
    process.stdout.write('ALREADY_UNLOCKED\n');
    return;
  }

  // Read vault header
  const headerPath = vaultHeaderPath();
  if (!fs.existsSync(headerPath)) {
    process.stderr.write('Vault is not initialized. Run "init" first.\n');
    process.exit(1);
  }
  const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));

  // Prompt for password
  const password = await promptPassword('Enter vault password: ');

  // Derive wrapping key
  const salt = Buffer.from(header.salt, 'base64');
  const params = { N: header.kdf.N, r: header.kdf.r, p: header.kdf.p };
  const wrappingKey = await deriveKey(password, salt, params);

  // Unwrap DEK
  let dek;
  try {
    dek = unwrapDEK(wrappingKey, Buffer.from(header.wrappedDEK, 'base64'));
  } catch (e) {
    process.stderr.write('Incorrect password.\n');
    process.exit(1);
  }

  // Decrypt manifest
  let manifest;
  try {
    manifest = decryptManifest(dek);
  } catch (e) {
    process.stderr.write('Failed to decrypt manifest. Vault may be corrupted.\n');
    process.exit(1);
  }

  // Decrypt all files
  const files = Object.keys(manifest.files);
  for (const relativePath of files) {
    const encFilePath = encPath(relativePath);
    const destPath = path.join(CLAUDE_DIR, relativePath);
    if (fs.existsSync(encFilePath)) {
      decryptFile(dek, encFilePath, destPath);
      process.stderr.write(`  Decrypted: ${relativePath}\n`);
    } else {
      process.stderr.write(`  Warning: missing encrypted file: ${relativePath}\n`);
    }
  }

  // Create .vault-state and mark as unlocked
  if (!fs.existsSync(VAULT_STATE_DIR)) {
    fs.mkdirSync(VAULT_STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(VAULT_STATE_DIR, '.unlocked'), '', 'utf8');

  // Cache DEK
  fs.writeFileSync(path.join(VAULT_STATE_DIR, '.dek'), dek.toString('base64'), 'utf8');

  // Spawn watchdog
  spawnWatchdog();

  process.stderr.write('\nVault unlocked with ' + files.length + ' files.\n');
  process.stdout.write('UNLOCKED\n');
}

/**
 * Lock the vault: re-encrypt dirty files, wipe plaintext, kill watchdog.
 */
async function cmdLock() {
  // Check if already locked
  if (!fs.existsSync(path.join(VAULT_STATE_DIR, '.unlocked'))) {
    process.stdout.write('ALREADY_LOCKED\n');
    return;
  }

  // Load cached DEK
  const dekPath = path.join(VAULT_STATE_DIR, '.dek');
  if (!fs.existsSync(dekPath)) {
    process.stderr.write('No cached DEK found. Cannot lock.\n');
    process.exit(1);
  }
  const dek = Buffer.from(fs.readFileSync(dekPath, 'utf8').trim(), 'base64');

  // Load existing manifest
  let manifest;
  try {
    manifest = decryptManifest(dek);
  } catch (e) {
    process.stderr.write('Failed to decrypt manifest. Starting fresh.\n');
    manifest = { version: 1, files: {} };
  }

  // Discover current source files and re-encrypt dirty ones
  const sourceFiles = discoverSourceFiles();
  const fileEntries = [];
  let reEncrypted = 0;

  for (const file of sourceFiles) {
    const dest = encPath(file.relativePath);
    let dirty = true;

    // Check if encrypted counterpart exists and compare mtimes
    if (fs.existsSync(dest)) {
      const srcStat = fs.statSync(file.absolutePath);
      const encStat = fs.statSync(dest);
      if (srcStat.mtimeMs <= encStat.mtimeMs) {
        dirty = false;
      }
    }

    if (dirty) {
      const size = encryptFile(dek, file.absolutePath, dest);
      fileEntries.push({ relativePath: file.relativePath, size });
      reEncrypted++;
      process.stderr.write(`  Re-encrypted: ${file.relativePath}\n`);
    } else {
      // Use existing manifest size or measure enc file
      const existingSize = manifest.files[file.relativePath]
        ? manifest.files[file.relativePath].size
        : fs.statSync(dest).size;
      fileEntries.push({ relativePath: file.relativePath, size: existingSize });
    }
  }

  // Build and encrypt updated manifest
  const newManifest = buildManifest(fileEntries);
  encryptManifest(dek, newManifest);

  // Wipe plaintext files
  wipePlaintext();

  // Wipe vault state
  wipeVaultState();

  process.stderr.write('\nVault locked. ' + reEncrypted + ' files re-encrypted.\n');
  process.stdout.write('LOCKED\n');
}

/**
 * Remove decrypted .md files from encyclopedia/ and journals/.
 */
function wipePlaintext() {
  const encyclopediaDir = path.join(CLAUDE_DIR, 'encyclopedia');
  if (fs.existsSync(encyclopediaDir)) {
    const files = fs.readdirSync(encyclopediaDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        fs.unlinkSync(path.join(encyclopediaDir, file));
      }
    }
  }

  const journalsDir = path.join(CLAUDE_DIR, JOURNAL_DIR);
  if (fs.existsSync(journalsDir)) {
    const files = fs.readdirSync(journalsDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        fs.unlinkSync(path.join(journalsDir, file));
      }
    }
  }
}

/**
 * Kill watchdog process and remove .vault-state directory.
 */
function wipeVaultState() {
  // Kill watchdog if running
  const pidFile = path.join(VAULT_STATE_DIR, '.watchdog-pid');
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid);
        } catch (e) {
          // Process may already be dead
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // Remove .vault-state directory
  if (fs.existsSync(VAULT_STATE_DIR)) {
    fs.rmSync(VAULT_STATE_DIR, { recursive: true, force: true });
  }
}

/**
 * Spawn the watchdog process (detached).
 */
function spawnWatchdog() {
  const timeout = configGet('vault_timeout_minutes', 30);
  const watchdogScript = path.join(path.dirname(__filename), 'journal-vault-watchdog.sh');

  if (!fs.existsSync(watchdogScript)) {
    process.stderr.write('  Warning: watchdog script not found, skipping.\n');
    return;
  }

  try {
    const child = spawn('bash', [watchdogScript, VAULT_STATE_DIR, String(timeout)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Save PID
    const pidFile = path.join(VAULT_STATE_DIR, '.watchdog-pid');
    fs.writeFileSync(pidFile, String(child.pid), 'utf8');
    process.stderr.write(`  Watchdog spawned (PID ${child.pid}, timeout ${timeout}m).\n`);
  } catch (e) {
    process.stderr.write(`  Warning: failed to spawn watchdog: ${e.message}\n`);
  }
}

// ─── Task 6: Status, Change-Password, Recover, Rotate-Recovery, CLI ────────

/**
 * Print vault status.
 */
function cmdStatus() {
  const headerPath = vaultHeaderPath();
  if (!fs.existsSync(headerPath)) {
    process.stderr.write('VAULT: not initialized\n');
    process.stdout.write('NOT_INITIALIZED\n');
    return;
  }

  const unlocked = fs.existsSync(path.join(VAULT_STATE_DIR, '.unlocked'));
  const state = unlocked ? 'unlocked' : 'locked';

  // Count encrypted files
  let fileCount = 0;
  try {
    const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));
    // Try to read manifest if unlocked
    if (unlocked) {
      const dekPath = path.join(VAULT_STATE_DIR, '.dek');
      if (fs.existsSync(dekPath)) {
        const dek = Buffer.from(fs.readFileSync(dekPath, 'utf8').trim(), 'base64');
        try {
          const manifest = decryptManifest(dek);
          fileCount = Object.keys(manifest.files).length;
        } catch (e) {
          fileCount = -1; // Unknown
        }
      }
    }
  } catch (e) {
    // Ignore
  }

  // Check watchdog PID
  let watchdogPid = null;
  const pidFile = path.join(VAULT_STATE_DIR, '.watchdog-pid');
  if (fs.existsSync(pidFile)) {
    try {
      watchdogPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      // Check if still alive
      try {
        process.kill(watchdogPid, 0);
      } catch (e) {
        watchdogPid = null; // Dead
      }
    } catch (e) {
      watchdogPid = null;
    }
  }

  process.stderr.write(`VAULT: ${state}\n`);
  if (fileCount >= 0) {
    process.stderr.write(`Files: ${fileCount}\n`);
  }
  if (watchdogPid) {
    process.stderr.write(`Watchdog PID: ${watchdogPid}\n`);
  }

  process.stdout.write(unlocked ? 'UNLOCKED\n' : 'LOCKED\n');
}

/**
 * Change the vault password. Prompts for old password, verifies, then prompts for new.
 */
async function cmdChangePassword() {
  const headerPath = vaultHeaderPath();
  if (!fs.existsSync(headerPath)) {
    process.stderr.write('Vault is not initialized.\n');
    process.exit(1);
  }

  const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));

  // Prompt for old password
  const oldPassword = await promptPassword('Enter current password: ');

  // Derive old wrapping key
  const oldSalt = Buffer.from(header.salt, 'base64');
  const oldParams = { N: header.kdf.N, r: header.kdf.r, p: header.kdf.p };
  const oldWrappingKey = await deriveKey(oldPassword, oldSalt, oldParams);

  // Verify by unwrapping DEK
  let dek;
  try {
    dek = unwrapDEK(oldWrappingKey, Buffer.from(header.wrappedDEK, 'base64'));
  } catch (e) {
    process.stderr.write('Incorrect password.\n');
    process.exit(1);
  }

  // Prompt for new password
  const newPassword = await promptPasswordConfirm('Enter new password: ');
  if (!newPassword) {
    process.stderr.write('Password cannot be empty.\n');
    process.exit(1);
  }

  // Derive new wrapping key with new salt
  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const newWrappingKey = await deriveKey(newPassword, newSalt, DEFAULT_SCRYPT_PARAMS);

  // Re-wrap DEK
  const newWrappedDEK = wrapDEK(newWrappingKey, dek);

  // Update header (keep recovery wrapping intact)
  header.salt = newSalt.toString('base64');
  header.wrappedDEK = newWrappedDEK.toString('base64');
  header.kdf.N = DEFAULT_SCRYPT_PARAMS.N;
  header.kdf.r = DEFAULT_SCRYPT_PARAMS.r;
  header.kdf.p = DEFAULT_SCRYPT_PARAMS.p;

  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2), 'utf8');

  process.stderr.write('Password changed successfully.\n');
  process.stdout.write('PASSWORD_CHANGED\n');
}

/**
 * Recover vault access using recovery key.
 * Prompts for recovery key (base64), unwraps DEK, prompts for new password, re-wraps.
 */
async function cmdRecover() {
  const headerPath = vaultHeaderPath();
  if (!fs.existsSync(headerPath)) {
    process.stderr.write('Vault is not initialized.\n');
    process.exit(1);
  }

  const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));

  // Prompt for recovery key
  const recoveryKeyBase64 = await promptPassword('Enter recovery key (base64): ');
  let recoveryKey;
  try {
    recoveryKey = Buffer.from(recoveryKeyBase64.trim(), 'base64');
    if (recoveryKey.length !== DEK_LENGTH) {
      throw new Error('Invalid recovery key length');
    }
  } catch (e) {
    process.stderr.write('Invalid recovery key format.\n');
    process.exit(1);
  }

  // Unwrap DEK with recovery key
  let dek;
  try {
    dek = unwrapDEK(recoveryKey, Buffer.from(header.recoveryWrappedDEK, 'base64'));
  } catch (e) {
    process.stderr.write('Invalid recovery key.\n');
    process.exit(1);
  }

  // Prompt for new password
  const newPassword = await promptPasswordConfirm('Enter new password: ');
  if (!newPassword) {
    process.stderr.write('Password cannot be empty.\n');
    process.exit(1);
  }

  // Derive new wrapping key
  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const newWrappingKey = await deriveKey(newPassword, newSalt, DEFAULT_SCRYPT_PARAMS);

  // Re-wrap DEK
  const newWrappedDEK = wrapDEK(newWrappingKey, dek);

  // Update header
  header.salt = newSalt.toString('base64');
  header.wrappedDEK = newWrappedDEK.toString('base64');
  header.kdf.N = DEFAULT_SCRYPT_PARAMS.N;
  header.kdf.r = DEFAULT_SCRYPT_PARAMS.r;
  header.kdf.p = DEFAULT_SCRYPT_PARAMS.p;

  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2), 'utf8');

  process.stderr.write('Vault recovered. Password has been reset.\n');
  process.stdout.write('RECOVERED\n');
}

/**
 * Rotate the recovery key. Requires vault to be unlocked (needs DEK from cache).
 */
function cmdRotateRecovery() {
  // Vault must be unlocked
  if (!fs.existsSync(path.join(VAULT_STATE_DIR, '.unlocked'))) {
    process.stderr.write('Vault must be unlocked to rotate recovery key.\n');
    process.exit(1);
  }

  // Load cached DEK
  const dekPath = path.join(VAULT_STATE_DIR, '.dek');
  if (!fs.existsSync(dekPath)) {
    process.stderr.write('No cached DEK found. Unlock the vault first.\n');
    process.exit(1);
  }
  const dek = Buffer.from(fs.readFileSync(dekPath, 'utf8').trim(), 'base64');

  // Read header
  const headerPath = vaultHeaderPath();
  const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));

  // Generate new recovery key
  const newRecoveryKey = crypto.randomBytes(DEK_LENGTH);

  // Re-wrap DEK with new recovery key
  const newRecoveryWrappedDEK = wrapDEK(newRecoveryKey, dek);

  // Update header
  header.recoveryWrappedDEK = newRecoveryWrappedDEK.toString('base64');
  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2), 'utf8');

  // Display new recovery key
  process.stderr.write('\n========================================\n');
  process.stderr.write('NEW RECOVERY KEY — SAVE THIS SOMEWHERE SAFE:\n');
  process.stderr.write(newRecoveryKey.toString('base64') + '\n');
  process.stderr.write('========================================\n');
  process.stderr.write('\nOld recovery key is now invalid.\n');

  process.stdout.write('RECOVERY_ROTATED\n');
}

// ─── CLI Dispatch ──────────────────────────────────────────────────────────

const commands = {
  'init': cmdInit,
  'unlock': cmdUnlock,
  'lock': cmdLock,
  'status': cmdStatus,
  'change-password': cmdChangePassword,
  'recover': cmdRecover,
  'rotate-recovery': cmdRotateRecovery,
};

async function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    process.stderr.write('Usage: node journal-vault.js <command>\n');
    process.stderr.write('\nCommands:\n');
    process.stderr.write('  init              Initialize the vault\n');
    process.stderr.write('  unlock            Decrypt files and unlock vault\n');
    process.stderr.write('  lock              Re-encrypt files and lock vault\n');
    process.stderr.write('  status            Show vault status\n');
    process.stderr.write('  change-password   Change vault password\n');
    process.stderr.write('  recover           Recover vault with recovery key\n');
    process.stderr.write('  rotate-recovery   Generate new recovery key\n');
    process.exit(0);
  }

  const fn = commands[command];
  if (!fn) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.stderr.write('Run with --help for usage.\n');
    process.exit(1);
  }

  try {
    await fn();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
