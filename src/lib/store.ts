import fs from "fs";
import path from "path";
import { put as vercelBlobPut, get as vercelBlobGet } from "@vercel/blob";

/**
 * Artifact store (spec §8).
 * Supports Vercel Blob when BLOB_READ_WRITE_TOKEN is present, with automatic
 * fallback to local filesystem under .data/artifacts for local development.
 */

export interface StoredArtifact {
  hash: string;
  ext: "svg" | "png" | "txt";
  contentType: string;
  data: Buffer | string;
  meta: Record<string, unknown>;
  blobUrl?: string;
}

export const CONTENT_TYPES: Record<StoredArtifact["ext"], string> = {
  svg: "image/svg+xml",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
};

const ROOT = path.join(process.cwd(), process.env.DATA_DIR || ".data", "artifacts");
const MEM_LIMIT = 500;

class ArtifactStore {
  private mem = new Map<string, StoredArtifact>();

  constructor() {
    try {
      fs.mkdirSync(ROOT, { recursive: true });
    } catch {
      // In serverless / read-only filesystem, fs mkdir might fail if not in /tmp
    }
  }

  private fileFor(hash: string, ext: string): string {
    return path.join(ROOT, `${hash}.${ext}`);
  }

  async put(artifact: StoredArtifact): Promise<void> {
    this.mem.set(artifact.hash, artifact);
    while (this.mem.size > MEM_LIMIT) {
      const oldest = this.mem.keys().next().value;
      if (oldest === undefined) break;
      this.mem.delete(oldest);
    }

    // 1) If Vercel Blob token is available, upload to Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const pathname = `artifacts/${artifact.hash}.${artifact.ext}`;
        const blob = await vercelBlobPut(pathname, artifact.data, {
          access: "public",
          contentType: artifact.contentType,
          addRandomSuffix: false,
        });
        artifact.blobUrl = blob.url;
      } catch (err) {
        console.warn("[store] Vercel Blob put warning:", err);
      }
    }

    // 2) Save to local filesystem as well if writable
    try {
      const finalPath = this.fileFor(artifact.hash, artifact.ext);
      const tmpPath = `${finalPath}.tmp`;
      fs.writeFileSync(tmpPath, artifact.data);
      fs.renameSync(tmpPath, finalPath);
    } catch {
      // Ignore if filesystem is read-only (e.g. Vercel Lambda without Blob)
    }
  }

  async get(hash: string): Promise<StoredArtifact | null> {
    const memHit = this.mem.get(hash);
    if (memHit) return memHit;

    // Try local filesystem first
    for (const ext of ["svg", "png", "txt"] as const) {
      const file = this.fileFor(hash, ext);
      try {
        if (fs.existsSync(file)) {
          const data = fs.readFileSync(file);
          const artifact: StoredArtifact = { hash, ext, contentType: CONTENT_TYPES[ext], data, meta: {} };
          this.mem.set(hash, artifact);
          return artifact;
        }
      } catch {
        // Continue if local fs check throws
      }
    }

    // If not on disk and Blob token is available, check Vercel Blob
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      for (const ext of ["svg", "png", "txt"] as const) {
        try {
          const pathname = `artifacts/${hash}.${ext}`;
          const res = await vercelBlobGet(pathname, { access: "public" });
          if (res && res.statusCode === 200 && res.stream) {
            const arrayBuf = await new Response(res.stream).arrayBuffer();
            const data = Buffer.from(arrayBuf);
            const artifact: StoredArtifact = { hash, ext, contentType: CONTENT_TYPES[ext], data, meta: {}, blobUrl: res.blob.url };
            this.mem.set(hash, artifact);
            return artifact;
          }
        } catch {
          // not found in blob
        }
      }
    }

    return null;
  }
}

export const store = new ArtifactStore();
