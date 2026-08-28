import { describe, expect, it } from "vitest";
import { injectAdaptiveTheme } from "@/lib/adaptive";
import { injectAttributionBadge } from "@/lib/badge";
import { dataLayer } from "@/lib/data-layer";

describe("Growth & Trust features", () => {
  it("injects attribution badge into SVG", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="100"/></svg>';
    const badgedSvg = injectAttributionBadge(rawSvg, { width: 512, height: 512 });

    expect(badgedSvg).toContain("gh-avatar-art-badge");
    expect(badgedSvg).toContain("gh-avatar-art");
    expect(badgedSvg).toContain("https://github-arts-creator.vercel.app");
  });

  it("injects prefers-color-scheme styles into SVG for theme adaptation", () => {
    const rawSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="0" y="0" width="512" height="512" fill="#ffffff"/><path fill="#111318" d="M0 0"/></svg>';
    const themedSvg = injectAdaptiveTheme(rawSvg, {
      styleId: "lineart",
      background: "#ffffff",
      isMonochrome: true,
    });

    expect(themedSvg).toContain("<style>");
    expect(themedSvg).toContain("@media (prefers-color-scheme: dark)");
    expect(themedSvg).toContain("--canvas-bg");
    expect(themedSvg).toContain("--canvas-ink");
  });

  it("records generation events and aggregates stats in dataLayer", async () => {
    const initial = await dataLayer.getStats();
    await dataLayer.recordGeneration("alice_dev", "halftone", "hash_test_1");
    await dataLayer.recordGeneration("bob_dev", "pixelart", "hash_test_2");
    await dataLayer.recordGeneration("alice_dev", "lowpoly", "hash_test_3");

    const updated = await dataLayer.getStats();
    expect(updated.totalGenerations).toBe(initial.totalGenerations + 3);
    expect(updated.uniqueUsernames).toBeGreaterThanOrEqual(2);
  });

  it("supports public gallery opt-in, style filtering, and removal", async () => {
    const testHash = "gallery_test_hash_abc123";
    await dataLayer.setGalleryOptIn(testHash, "charlie", "pixelart", true);

    const gallery = await dataLayer.getPublicGallery("pixelart");
    const found = gallery.items.some((i) => i.hash === testHash);
    expect(found).toBe(true);

    // Report / removal
    await dataLayer.reportGalleryItem(testHash);
    const afterReport = await dataLayer.getPublicGallery("pixelart");
    expect(afterReport.items.some((i) => i.hash === testHash)).toBe(false);
  });
});
