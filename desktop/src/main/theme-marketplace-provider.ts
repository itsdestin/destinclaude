import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  ThemeRegistryIndex,
  ThemeRegistryEntry,
  ThemeMarketplaceFilters,
  ThemeRegistryEntryWithStatus,
} from '../shared/theme-marketplace-types';
import { THEMES_DIR } from './theme-watcher';

// Registry is fetched from this URL (GitHub Pages or raw GitHub)
const REGISTRY_URL =
  'https://raw.githubusercontent.com/itsdestin/destinclaude-themes/main/registry/theme-registry.json';

// Local cache for offline use
const CACHE_DIR = path.join(os.homedir(), '.claude', 'destincode-cache');
const CACHE_PATH = path.join(CACHE_DIR, 'theme-registry.json');
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Max total download size per theme (10 MB)
const MAX_THEME_SIZE_BYTES = 10 * 1024 * 1024;

// Slug must be kebab-case: lowercase letters, digits, hyphens only
const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ThemeMarketplaceProvider {
  private cachedIndex: ThemeRegistryIndex | null = null;
  private cacheTimestamp = 0;

  /** Fetch registry (with cache), apply filters, annotate install status. */
  async listThemes(filters?: ThemeMarketplaceFilters): Promise<ThemeRegistryEntryWithStatus[]> {
    const index = await this.fetchRegistry();
    let themes = index.themes;

    // Apply filters
    if (filters?.source && filters.source !== 'all') {
      themes = themes.filter(t => t.source === filters.source);
    }
    if (filters?.mode && filters.mode !== 'all') {
      const wantDark = filters.mode === 'dark';
      themes = themes.filter(t => t.dark === wantDark);
    }
    if (filters?.features && filters.features.length > 0) {
      const wanted = new Set(filters.features);
      themes = themes.filter(t => t.features.some(f => wanted.has(f)));
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase();
      themes = themes.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false),
      );
    }

    // Sort
    if (filters?.sort === 'name') {
      themes = [...themes].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default: newest first
      themes = [...themes].sort((a, b) =>
        (b.created ?? '').localeCompare(a.created ?? ''),
      );
    }

    // Annotate with install status
    return themes.map(t => ({
      ...t,
      installed: this.isInstalled(t.slug),
    }));
  }

  /** Get a single theme's detail from the registry. */
  async getThemeDetail(slug: string): Promise<ThemeRegistryEntryWithStatus | null> {
    const index = await this.fetchRegistry();
    const entry = index.themes.find(t => t.slug === slug);
    if (!entry) return null;
    return { ...entry, installed: this.isInstalled(slug) };
  }

  /**
   * Install a theme from the marketplace.
   * Downloads manifest.json + assets, validates, sanitizes CSS, writes to disk.
   */
  async installTheme(slug: string): Promise<{ status: 'installed' | 'failed'; error?: string }> {
    try {
      // Validate slug
      if (!SAFE_SLUG_RE.test(slug)) {
        return { status: 'failed', error: 'Invalid theme slug' };
      }

      // Get registry entry
      const index = await this.fetchRegistry();
      const entry = index.themes.find(t => t.slug === slug);
      if (!entry) {
        return { status: 'failed', error: 'Theme not found in registry' };
      }

      // Download manifest
      const manifestRes = await fetch(entry.manifestUrl);
      if (!manifestRes.ok) {
        return { status: 'failed', error: `Failed to download manifest: ${manifestRes.status}` };
      }
      const manifestText = await manifestRes.text();

      // Validate + sanitize (imports sanitizeCSS for community themes)
      const { validateCommunityTheme } = await import('../renderer/themes/theme-validator');
      const theme = validateCommunityTheme(JSON.parse(manifestText));

      // Inject source: 'community' into the manifest
      const manifestWithSource = { ...theme, source: 'community' };

      // Create theme directory
      const themeDir = path.join(THEMES_DIR, slug);
      const assetsDir = path.join(themeDir, 'assets');
      await fs.promises.mkdir(assetsDir, { recursive: true });

      // Download assets (with size tracking)
      let totalBytes = Buffer.byteLength(JSON.stringify(manifestWithSource));

      if (entry.assetUrls) {
        for (const [relativePath, url] of Object.entries(entry.assetUrls)) {
          // Validate relative path (no path traversal)
          const resolved = path.resolve(themeDir, relativePath);
          if (!resolved.startsWith(themeDir + path.sep)) {
            return { status: 'failed', error: `Invalid asset path: ${relativePath}` };
          }

          const assetRes = await fetch(url);
          if (!assetRes.ok) {
            return { status: 'failed', error: `Failed to download asset ${relativePath}: ${assetRes.status}` };
          }

          const buffer = Buffer.from(await assetRes.arrayBuffer());
          totalBytes += buffer.length;

          if (totalBytes > MAX_THEME_SIZE_BYTES) {
            // Cleanup partial download
            await fs.promises.rm(themeDir, { recursive: true, force: true });
            return { status: 'failed', error: 'Theme exceeds 10MB size limit' };
          }

          // Ensure subdirectory exists
          await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
          await fs.promises.writeFile(resolved, buffer);
        }
      }

      // Write manifest last (theme-watcher triggers on manifest.json presence)
      await fs.promises.writeFile(
        path.join(themeDir, 'manifest.json'),
        JSON.stringify(manifestWithSource, null, 2),
        'utf-8',
      );

      return { status: 'installed' };
    } catch (err: any) {
      return { status: 'failed', error: err?.message ?? 'Unknown error' };
    }
  }

  /**
   * Uninstall a community theme. Refuses to delete user-created themes.
   */
  async uninstallTheme(slug: string): Promise<{ status: 'uninstalled' | 'failed'; error?: string }> {
    try {
      if (!SAFE_SLUG_RE.test(slug)) {
        return { status: 'failed', error: 'Invalid theme slug' };
      }

      const themeDir = path.join(THEMES_DIR, slug);
      const manifestPath = path.join(themeDir, 'manifest.json');

      if (!fs.existsSync(manifestPath)) {
        return { status: 'failed', error: 'Theme not found on disk' };
      }

      // Read manifest and verify it's a community theme
      const raw = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
      if (raw.source !== 'community') {
        return { status: 'failed', error: 'Cannot uninstall non-community themes via marketplace' };
      }

      await fs.promises.rm(themeDir, { recursive: true, force: true });
      return { status: 'uninstalled' };
    } catch (err: any) {
      return { status: 'failed', error: err?.message ?? 'Unknown error' };
    }
  }

  /** Check if a community theme is installed locally. */
  isInstalled(slug: string): boolean {
    try {
      const manifestPath = path.join(THEMES_DIR, slug, 'manifest.json');
      return fs.existsSync(manifestPath);
    } catch {
      return false;
    }
  }

  // --- Internal ---

  private async fetchRegistry(): Promise<ThemeRegistryIndex> {
    // Return in-memory cache if fresh
    if (this.cachedIndex && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedIndex;
    }

    // Try fetching from remote
    try {
      const res = await fetch(REGISTRY_URL);
      if (res.ok) {
        const index: ThemeRegistryIndex = await res.json();
        this.cachedIndex = index;
        this.cacheTimestamp = Date.now();
        // Write to disk cache (async, fire-and-forget)
        this.writeDiskCache(index);
        return index;
      }
    } catch {
      // Network error — fall through to disk cache
    }

    // Fall back to disk cache
    const diskCache = this.readDiskCache();
    if (diskCache) {
      this.cachedIndex = diskCache;
      this.cacheTimestamp = Date.now();
      return diskCache;
    }

    // No cache at all — return empty registry
    return { version: 0, generatedAt: '', themes: [] };
  }

  private readDiskCache(): ThemeRegistryIndex | null {
    try {
      const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async writeDiskCache(index: ThemeRegistryIndex): Promise<void> {
    try {
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      await fs.promises.writeFile(CACHE_PATH, JSON.stringify(index), 'utf-8');
    } catch {
      // Non-critical — continue without caching
    }
  }
}
