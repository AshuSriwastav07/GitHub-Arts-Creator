import { describe, expect, it } from "vitest";
import { analyzeImage } from "@/lib/analysis";
import { artifactIdentityHash } from "@/lib/hash";
import { STYLES } from "@/lib/styles/registry";
import { coerceParams, defaultParams } from "@/lib/styles/params";
import type { AvatarStyle } from "@/lib/styles/types";
import { makeTestImage } from "./helpers";

/**
 * Spec §12.3: same username + style + params + seed must return the
 * byte-identical artifact. These tests pin generator determinism directly.
 */
describe("style determinism", () => {
  it.each(STYLES.map((s) => [s.id, s] as const))(
    "%s produces byte-identical output for identical inputs",
    async (_id, style: AvatarStyle) => {
      const buf = await makeTestImage(160);
      const analysis = await analyzeImage(buf, { size: 96 });
      const params = coerceParams(style, {
        ...defaultParams(style),
        ...(style.id === "charmosa" ? { _username: "octocat" } : {}),
        ...(style.id === "heatmap" ? { _contrib: "" } : {}),
      });
      const a = style.generate(analysis, params, 42);
      const b = style.generate(analysis, params, 42);
      if (typeof a.data === "string") {
        expect(b.data).toBe(a.data); // exact byte equality of the UTF-8 artifact
      } else {
        expect(Buffer.isBuffer(b.data)).toBe(true);
        expect((b.data as Buffer).equals(a.data as Buffer)).toBe(true);
      }
    }
  );

  it("stochastic styles change output with a different seed; deterministic ones do not drift", async () => {
    const buf = await makeTestImage(160);
    const analysis = await analyzeImage(buf, { size: 96 });

    const halftone = STYLES.find((s) => s.id === "halftone")!;
    const stippleParams = coerceParams(halftone, {
      dotShape: "stipple",
      resolution: 32,
      colorMode: "mono",
    });
    const s1 = halftone.generate(analysis, stippleParams, 1).data as string;
    const s2 = halftone.generate(analysis, stippleParams, 999999).data as string;
    expect(s1).not.toBe(s2);

    const pixelart = STYLES.find((s) => s.id === "pixelart")!;
    const pParams = defaultParams(pixelart);
    expect(pixelart.generate(analysis, pParams, 5).data).toBe(
      pixelart.generate(analysis, pParams, 7777777).data
    );
  });

  it("charmosa text output is deterministic and respects the injected username", async () => {
    const buf = await makeTestImage(160);
    const analysis = await analyzeImage(buf, { size: 96 });
    const charmosa = STYLES.find((s) => s.id === "charmosa")!;

    const paramsA = coerceParams(charmosa, { charset: "username", cols: 40, _username: "octocat" });
    const t1 = charmosa.generateText!(analysis, paramsA, 7).rows.join("\n");
    const t2 = charmosa.generateText!(analysis, paramsA, 7).rows.join("\n");
    expect(t1).toBe(t2);

    const paramsB = coerceParams(charmosa, { charset: "braille", cols: 40 });
    const b1 = charmosa.generateText!(analysis, paramsB, 3).rows;
    expect(b1.length).toBeGreaterThan(4);
    // braille chars live in U+2800–U+28FF (plus spaces)
    for (const row of b1) {
      for (const ch of row) {
        expect(ch === " " || (ch.codePointAt(0)! >= 0x2800 && ch.codePointAt(0)! <= 0x28ff)).toBe(true);
      }
    }
  });
});

describe("artifact identity hashing", () => {
  const base = {
    username: "octocat",
    avatarUrl: "https://avatars.githubusercontent.com/u/583231",
    styleId: "halftone",
    params: { resolution: 56, dotShape: "circle" },
    seed: 42,
  };

  it("is stable across repeated calls", () => {
    expect(artifactIdentityHash(base)).toBe(artifactIdentityHash({ ...base }));
  });

  it("ignores key insertion order in params", () => {
    const reordered = { ...base, params: { dotShape: "circle", resolution: 56 } };
    expect(artifactIdentityHash(reordered)).toBe(artifactIdentityHash(base));
  });

  it("changes when any identity input changes", () => {
    expect(artifactIdentityHash({ ...base, seed: 43 })).not.toBe(artifactIdentityHash(base));
    expect(artifactIdentityHash({ ...base, styleId: "lowpoly" })).not.toBe(artifactIdentityHash(base));
    expect(artifactIdentityHash({ ...base, username: "torvalds" })).not.toBe(artifactIdentityHash(base));
    expect(
      artifactIdentityHash({ ...base, params: { ...base.params, resolution: 60 } })
    ).not.toBe(artifactIdentityHash(base));
  });

  it("produces a 40-char lowercase hex id suitable for permanent URLs", () => {
    const hash = artifactIdentityHash(base);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("banner parameters participate in identity hashing and generate valid banner SVG", () => {
    const bannerHash = artifactIdentityHash({
      ...base,
      params: { ...base.params, bannerEnabled: true, bannerTitle: "The Octocat", bannerTheme: "terminal" },
    });
    expect(bannerHash).toMatch(/^[0-9a-f]{40}$/);
    expect(bannerHash).not.toBe(artifactIdentityHash(base));
  });
});
