import { createHash } from "crypto";
import { stableStringify } from "./canonical";

export interface ArtifactIdentity {
  username: string;
  avatarUrl: string;
  styleId: string;
  params: Record<string, unknown>;
  seed: number;
}

/**
 * Artifact identity = hash(username + avatar url + styleId + canonical params + seed).
 * The same identity always maps to the same stored bytes, which is what makes
 * `/api/avatar/<hash>.<ext>` URLs permanent and immutable.
 */
export function artifactIdentityHash(identity: ArtifactIdentity): string {
  const payload = [
    identity.username.toLowerCase(),
    identity.avatarUrl,
    identity.styleId,
    stableStringify(identity.params ?? {}),
    String(identity.seed),
  ].join("\n");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 40);
}
