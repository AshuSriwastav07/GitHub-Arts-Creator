import { dataLayer, type DiscoveredUsage } from "./data-layer";

/**
 * Discovers real GitHub repositories that embed GitHub Avatar Art in their README.md
 * using GitHub's REST Code Search API (spec §5).
 */
export async function runCodeSearchDiscovery(domain?: string): Promise<{
  discovered: number;
  totalStored: number;
  rateLimitRemaining?: number;
  error?: string;
}> {
  const targetDomain = domain || process.env.NEXT_PUBLIC_APP_URL || "github-arts-creator.vercel.app";
  const cleanDomain = targetDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "GitHub-Avatar-Art-Discovery/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const query = `"${cleanDomain}/api/avatar" in:file filename:README.md`;
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=30`;

  try {
    const res = await fetch(url, { headers });
    const remaining = res.headers.get("x-ratelimit-remaining");
    const rateLimitRemaining = remaining ? parseInt(remaining, 10) : undefined;

    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        return {
          discovered: 0,
          totalStored: (await dataLayer.getDiscoveredUsages()).length,
          rateLimitRemaining,
          error: "GitHub search rate limit reached. Will retry on next scheduled run.",
        };
      }
      const errText = await res.text().catch(() => "Unknown error");
      return {
        discovered: 0,
        totalStored: (await dataLayer.getDiscoveredUsages()).length,
        rateLimitRemaining,
        error: `GitHub Code Search error (${res.status}): ${errText}`,
      };
    }

    const data = (await res.json()) as {
      total_count?: number;
      items?: Array<{
        name?: string;
        path?: string;
        html_url?: string;
        repository?: {
          id: number;
          full_name: string;
          html_url: string;
          stargazers_count?: number;
          description?: string;
          owner?: {
            login: string;
            avatar_url: string;
          };
        };
      }>;
    };

    const items = data.items || [];
    const now = new Date().toISOString();
    const newUsages: DiscoveredUsage[] = [];

    for (const item of items) {
      if (!item.repository) continue;
      newUsages.push({
        repoFullName: item.repository.full_name,
        repoUrl: item.repository.html_url,
        ownerAvatarUrl: item.repository.owner?.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        stars: item.repository.stargazers_count || 0,
        description: item.repository.description || undefined,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }

    await dataLayer.saveDiscoveredUsages(newUsages);
    const allUsages = await dataLayer.getDiscoveredUsages();

    return {
      discovered: newUsages.length,
      totalStored: allUsages.length,
      rateLimitRemaining,
    };
  } catch (err) {
    return {
      discovered: 0,
      totalStored: (await dataLayer.getDiscoveredUsages()).length,
      error: (err as Error).message,
    };
  }
}
