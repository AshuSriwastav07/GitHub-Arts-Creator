import fs from "fs";
import path from "path";

/**
 * Artifact store (spec §8). MVP implementation: filesystem under .data/artifacts,
 * keyed by the deterministic identity hash. The interface is deliberately narrow
 * so an S3-compatible backend can be dropped in without touching callers.
 */

export interface StoredArtifact {
  hash: string;
  ext: "svg" | "png" | "txt";
  contentType: string;
  data: Buffer | string;
  meta: Record<string, unknown>;
}

export const CONTENT_TYPES: Record<StoredArtifact["ext"], string> = {
  svg: "image/svg+xml",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
};

const ROOT = path.join(process.cwd(), ".data", "artifacts");
const MEM_LIMIT = 500;

class FsStore {
  private mem = new Map<string, StoredArtifact>();

  constructor() {
    fs.mkdirSync(ROOT, { recursive: true });
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
    const finalPath = this.fileFor(artifact.hash, artifact.ext);
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, artifact.data);
    fs.renameSync(tmpPath, finalPath); // atomic-ish on same volume
  }

  async get(hash: string): Promise<StoredArtifact | null> {
    const memHit = this.mem.get(hash);
    if (memHit) return memHit;
    for (const ext of ["svg", "png", "txt"] as const) {
      const file = this.fileFor(hash, ext);
      if (fs.existsSync(file)) {
        const data = fs.readFileSync(file);
        const artifact: StoredArtifact = { hash, ext, contentType: CONTENT_TYPES[ext], data, meta: {} };
        this.mem.set(hash, artifact);
        return artifact;
      }
    }
    return null;
  }
}

export const store = new FsStore();
