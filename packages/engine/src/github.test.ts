import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fetchContext, fetchOriginalEffort, GitHubClient, linkedIssues, redact } from "./github.js";
import type { Candidate } from "./types.js";

const cacheRoot = mkdtempSync(path.join(os.tmpdir(), "dejabug-gh-"));
afterAll(() => rmSync(cacheRoot, { recursive: true, force: true }));

describe("redact", () => {
  it("removes mentions, emails, attachments and template comments", () => {
    const text =
      "<!-- template -->Reported by @jane-doe (jane@example.com), see https://github.com/user-attachments/assets/abc.png\n\n\n\ncc @bob";
    expect(redact(text)).toBe("Reported by @someone ([email]), see [attachment]\n\ncc @someone");
  });

  it("keeps code-ish text and truncates long bodies", () => {
    expect(redact("use `x@y` in a comment")).toContain("x@y");
    expect(redact("a".repeat(50), 10)).toBe("aaaaaaaaaa\n[truncated]");
  });
});

describe("linkedIssues", () => {
  it("reads GitHub closing keywords", () => {
    expect(linkedIssues("Fixes #12 and closes #7. Resolves: #12")).toEqual([12, 7]);
    expect(linkedIssues("Related to #9")).toEqual([]);
  });
});

function fakeGitHub(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const route = String(url).replace("https://api.github.com/repos/o/r", "");
    calls.push(route);
    if (!(route in routes)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(routes[route]), { status: 200, headers: { etag: `"${route}"` } });
  }) as typeof fetch;
  return { client: new GitHubClient("o/r", "t", cacheRoot, impl), calls };
}

const candidate: Candidate = {
  fixSha: "abc123",
  parentSha: "def456",
  subject: "fix: stop leaking brokers",
  date: "2026-01-10T00:00:00Z",
  language: "go",
  sourceFiles: ["client.go"],
  testFiles: ["client_test.go"],
  packages: ["."],
  tests: ["TestLeak"],
};

describe("fetchContext and fetchOriginalEffort", () => {
  const { client, calls } = fakeGitHub({
    "/commits/abc123/pulls": [{ number: 42, merged_at: "2026-01-10T00:00:00Z" }],
    "/pulls/42": {
      number: 42,
      title: "Stop leaking brokers",
      body: "Fixes #40. Thanks @alice",
      created_at: "2026-01-08T00:00:00Z",
      merged_at: "2026-01-10T00:00:00Z",
      comments: 2,
      review_comments: 5,
    },
    "/issues/40": {
      number: 40,
      title: "Broker leak",
      body: "Memory grows, reported by bob@corp.com",
      created_at: "2026-01-01T00:00:00Z",
      comments: 3,
    },
    "/issues/42/comments?per_page=50": [{ body: "LGTM @carol", user: { login: "carol" } }],
    "/issues/40/comments?per_page=50": [{ body: "Seeing this too" }],
    "/pulls/42/reviews?per_page=100": [{ state: "CHANGES_REQUESTED" }, { state: "APPROVED" }],
  });

  it("resolves the PR from the commit when the subject has no number, and redacts people", async () => {
    const ctx = await fetchContext(client, candidate);
    expect(ctx).toMatchObject({ prNumber: 42, issueNumber: 40, issueTitle: "Broker leak" });
    expect(ctx.prBody).toBe("Fixes #40. Thanks @someone");
    expect(ctx.issueBody).toBe("Memory grows, reported by [email]");
    expect(ctx.combinedComments).toBe("Seeing this too\n---\nLGTM @someone");
    expect(JSON.stringify(ctx)).not.toMatch(/alice|carol|bob@/);
    expect(calls[0]).toBe("/commits/abc123/pulls");
  });

  it("computes original effort as counts and durations only", async () => {
    const effort = await fetchOriginalEffort(client, candidate);
    expect(effort).toEqual({ daysOpen: 9, comments: 10, reviewRounds: 2, mergedAt: "2026-01-10T00:00:00Z" });
  });

  it("falls back to the commit when there is no PR", async () => {
    const { client: empty } = fakeGitHub({});
    expect(await fetchOriginalEffort(empty, { ...candidate, fixSha: "zzz" })).toEqual({
      mergedAt: candidate.date,
    });
    const ctx = await fetchContext(empty, { ...candidate, fixSha: "zzz" });
    expect(ctx.prTitle).toBe(candidate.subject);
  });
});
