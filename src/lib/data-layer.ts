import fs from "fs";
import path from "path";
import { put as vercelBlobPut, get as vercelBlobGet } from "@vercel/blob";

export interface UsageStats {
  totalGenerations: number;
  uniqueUsernames: number;
  lastUpdated: string;
}

export interface GenerationEvent {
  id: string;
  username: string;
  styleId: string;
  hash: string;
  isPublic: boolean;
  createdAt: string;
}

export interface DiscoveredUsage {
  repoFullName: string;
  repoUrl: string;
  ownerAvatarUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  stars?: number;
  description?: string;
}

interface DataState {
  stats: UsageStats;
  usernames: Record<string, boolean>;
  events: GenerationEvent[];
  discoveredUsages: DiscoveredUsage[];
}

const ROOT = path.join(process.cwd(), process.env.DATA_DIR || ".data", "store");
const STATE_FILE = "app_state.json";
const BLOB_PATH = "data/app_state.json";

class DataLayer {
  private state: DataState = {
    stats: { totalGenerations: 0, uniqueUsernames: 0, lastUpdated: new Date().toISOString() },
    usernames: {},
    events: [],
    discoveredUsages: [],
  };
  private loaded = false;
  private saving = false;
  private pendingSave = false;

  constructor() {
    try {
      fs.mkdirSync(ROOT, { recursive: true });
    } catch {
      // serverless fallback
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    // 1) Try local file
    try {
      const filePath = path.join(ROOT, STATE_FILE);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          this.state = { ...this.state, ...parsed };
          return;
        }
      }
    } catch {
      // local read failed
    }

    // 2) Try Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const res = await vercelBlobGet(BLOB_PATH, { access: "public" });
        if (res && res.statusCode === 200 && res.stream) {
          const text = await new Response(res.stream).text();
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed === "object") {
            this.state = { ...this.state, ...parsed };
          }
        }
      } catch {
        // blob read failed or not found yet
      }
    }
  }

  private async scheduleSave(): Promise<void> {
    if (this.saving) {
      this.pendingSave = true;
      return;
    }
    this.saving = true;
    this.pendingSave = false;

    try {
      const payload = JSON.stringify(this.state, null, 2);

      // Save locally
      try {
        const filePath = path.join(ROOT, STATE_FILE);
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, payload, "utf-8");
        fs.renameSync(tmpPath, filePath);
      } catch {
        // local write ignored in read-only environment
      }

      // Save to Vercel Blob
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          await vercelBlobPut(BLOB_PATH, payload, {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false,
          });
        } catch (err) {
          console.warn("[dataLayer] Blob save warning:", err);
        }
      }
    } finally {
      this.saving = false;
      if (this.pendingSave) {
        this.pendingSave = false;
        void this.scheduleSave();
      }
    }
  }

  /** Record a fresh generation event asynchronously without blocking response */
  async recordGeneration(username: string, styleId: string, hash: string, isPublic = true): Promise<void> {
    await this.ensureLoaded();
    const cleanUser = username.toLowerCase().trim();

    this.state.usernames[cleanUser] = true;
    this.state.stats.totalGenerations += 1;
    this.state.stats.uniqueUsernames = Object.keys(this.state.usernames).length;
    this.state.stats.lastUpdated = new Date().toISOString();

    // Check if event with this hash already exists
    const existingIndex = this.state.events.findIndex((e) => e.hash === hash);
    if (existingIndex !== -1) {
      this.state.events[existingIndex].createdAt = new Date().toISOString();
      if (isPublic) {
        this.state.events[existingIndex].isPublic = true;
      }
    } else {
      const event: GenerationEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username,
        styleId,
        hash,
        isPublic: true, // Automatically added to community showcase
        createdAt: new Date().toISOString(),
      };
      this.state.events.unshift(event);
      if (this.state.events.length > 500) {
        this.state.events = this.state.events.slice(0, 500);
      }
    }

    void this.scheduleSave();
  }

  async getStats(): Promise<{ totalGenerations: number; uniqueUsernames: number }> {
    await this.ensureLoaded();
    return {
      totalGenerations: this.state.stats.totalGenerations,
      uniqueUsernames: this.state.stats.uniqueUsernames,
    };
  }

  async setGalleryOptIn(hash: string, username: string, styleId: string, isPublic: boolean): Promise<boolean> {
    await this.ensureLoaded();
    let found = false;

    for (const ev of this.state.events) {
      if (ev.hash === hash) {
        ev.isPublic = isPublic;
        found = true;
        break;
      }
    }

    if (!found && isPublic) {
      this.state.events.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username,
        styleId,
        hash,
        isPublic: true,
        createdAt: new Date().toISOString(),
      });
      found = true;
    }

    void this.scheduleSave();
    return found;
  }

  async getPublicGallery(
    style?: string,
    cursor?: string,
    limit = 24
  ): Promise<{ items: Array<GenerationEvent & { thumbnailUrl: string }>; nextCursor?: string }> {
    await this.ensureLoaded();

    let filtered = this.state.events.filter((e) => e.isPublic);
    if (style && style !== "all") {
      filtered = filtered.filter((e) => e.styleId === style);
    }

    const startIndex = cursor ? filtered.findIndex((e) => e.id === cursor) + 1 : 0;
    const paged = filtered.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < filtered.length ? paged[paged.length - 1]?.id : undefined;

    return {
      items: paged.map((e) => ({
        ...e,
        thumbnailUrl: `/api/avatar/${e.hash}.svg`,
      })),
      nextCursor,
    };
  }

  async reportGalleryItem(hash: string, _reason?: string): Promise<boolean> {
    await this.ensureLoaded();
    let removed = false;
    this.state.events = this.state.events.filter((e) => {
      if (e.hash === hash) {
        removed = true;
        return false;
      }
      return true;
    });
    if (removed) void this.scheduleSave();
    return removed;
  }

  async getDiscoveredUsages(): Promise<DiscoveredUsage[]> {
    await this.ensureLoaded();
    return this.state.discoveredUsages;
  }

  async saveDiscoveredUsages(newUsages: DiscoveredUsage[]): Promise<void> {
    await this.ensureLoaded();
    const map = new Map<string, DiscoveredUsage>();
    for (const u of this.state.discoveredUsages) {
      map.set(u.repoFullName.toLowerCase(), u);
    }

    for (const u of newUsages) {
      const key = u.repoFullName.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        map.set(key, {
          ...existing,
          lastSeenAt: u.lastSeenAt,
          stars: u.stars ?? existing.stars,
          description: u.description ?? existing.description,
        });
      } else {
        map.set(key, u);
      }
    }

    this.state.discoveredUsages = Array.from(map.values())
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
      .slice(0, 100);

    void this.scheduleSave();
  }
}

export const dataLayer = new DataLayer();
