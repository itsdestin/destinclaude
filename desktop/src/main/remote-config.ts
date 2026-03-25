import fs from 'fs';
import path from 'path';
import os from 'os';
import bcrypt from 'bcryptjs';

const CONFIG_PATH = () => path.join(os.homedir(), '.claude', 'destincode-remote.json');
const BCRYPT_ROUNDS = 10;

interface ConfigData {
  enabled: boolean;
  port: number;
  passwordHash: string | null;
  trustTailscale: boolean;
}

export class RemoteConfig {
  enabled: boolean;
  port: number;
  passwordHash: string | null;
  trustTailscale: boolean;

  constructor() {
    const defaults: ConfigData = {
      enabled: true,
      port: 9900,
      passwordHash: null,
      trustTailscale: false,
    };

    const configPath = CONFIG_PATH();
    if (fs.existsSync(configPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.enabled = data.enabled ?? defaults.enabled;
        this.port = data.port ?? defaults.port;
        this.passwordHash = data.passwordHash ?? defaults.passwordHash;
        this.trustTailscale = data.trustTailscale ?? defaults.trustTailscale;
        return;
      } catch {
        // Fall through to defaults
      }
    }

    this.enabled = defaults.enabled;
    this.port = defaults.port;
    this.passwordHash = defaults.passwordHash;
    this.trustTailscale = defaults.trustTailscale;
  }

  async setPassword(plaintext: string): Promise<void> {
    this.passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
    this.save();
  }

  async verifyPassword(plaintext: string): Promise<boolean> {
    if (!this.passwordHash) return false;
    return bcrypt.compare(plaintext, this.passwordHash);
  }

  /** Check if an IP is in the Tailscale CGNAT range (100.64.0.0/10). */
  isTailscaleIp(ip: string): boolean {
    // Strip IPv6-mapped IPv4 prefix
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const parts = normalized.split('.');
    if (parts.length !== 4) return false;
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    // 100.64.0.0/10 = 100.64.0.0 – 100.127.255.255
    return first === 100 && second >= 64 && second <= 127;
  }

  private save(): void {
    const configPath = CONFIG_PATH();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      enabled: this.enabled,
      port: this.port,
      passwordHash: this.passwordHash,
      trustTailscale: this.trustTailscale,
    }, null, 2));
  }
}
