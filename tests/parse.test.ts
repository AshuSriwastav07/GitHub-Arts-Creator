import { describe, expect, it } from "vitest";
import { parseGitHubInput, USERNAME_PATTERN } from "@/lib/github";
import { AppError } from "@/lib/errors";

describe("parseGitHubInput", () => {
  const ok = [
    ["torvalds", "torvalds"],
    ["@octocat", "octocat"],
    ["https://github.com/torvalds", "torvalds"],
    ["http://github.com/octocat/", "octocat"],
    ["https://www.github.com/octocat?tab=repositories", "octocat"],
    ["github.com/gaearon", "gaearon"],
    ["https://github.com/some-user-name", "some-user-name"],
    ["HTTPS://GITHUB.COM/TORVALDS", "TORVALDS"],
  ] as const;

  it.each(ok)("accepts %s → %s", (input, expected) => {
    expect(parseGitHubInput(input)).toBe(expected);
  });

  const bad = [
    "",
    "   ",
    "has space",
    "https://gitlab.com/torvalds",
    "https://example.com/github.com/x",
    "https://github.com/a/b",
    "https://github.com/torvalds/repos",
    "https://github.com/orgs/vercel",
    "javascript:alert(1)",
    "-leadinghyphen",
    "trailinghyphen-",
    "double--hyphen",
    "/",
    "user/repo",
    "@@@",
    "thisusernameiswaytoolongtobeavalidgithubname!", // >39 chars w/ symbols
  ];

  it.each(bad)("rejects %s", (input) => {
    expect(() => parseGitHubInput(input)).toThrow(AppError);
    expect(() => parseGitHubInput(input)).toThrow(/valid GitHub profile/);
  });

  it("rejects org/repo-shaped and deeper paths distinctly as invalid input", () => {
    try {
      parseGitHubInput("https://github.com/facebook/react/issues");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("INVALID_INPUT");
    }
  });
});

describe("USERNAME_PATTERN", () => {
  it("allows exactly 39-char alphanumeric/hyphen names", () => {
    expect(USERNAME_PATTERN.test("a".repeat(39))).toBe(true);
    expect(USERNAME_PATTERN.test("a".repeat(40))).toBe(false);
  });
});
