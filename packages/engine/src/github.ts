import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Config } from "./config.js";
import type { Candidate, OriginalEffort } from "./types.js";

// GitHub context for briefs (PROJECT.md 4.1 F3/F5). Personal information is stripped at fetch
// time: bodies keep their text, but @mentions, emails and user-attachment links are redacted,
// and no author fields are ever read into the returned objects.

export interface GitHubContext {
  prNumber?: number;
  prTitle: string;
  prBody: string;
  issueNumber?: number;
  issueTitle: string;
  issueBody: string;
  combinedComments: string;
}

const API = "https://api.github.com";
const MAX_BODY = 6000;
const MAX_COMMENTS = 8000;

/** Redacts personal information from free text and trims noise (HTML comments from PR templates). */
export function redact(text: string | null | undefined, max = MAX_BODY): string {
  if (!text) return "";
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(
      /https?:\/\/(?:github\.com\/user-attachments|avatars\.githubusercontent\.com)\S*/g,
      "[attachment]",
    )
    .replace(/(^|[^\w`])@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\b/g, "$1@someone")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}\n[truncated]` : cleaned;
}

/** Issue numbers referenced with GitHub closing keywords ("Fixes #12", "closes owner/repo#3" is ignored). */
export function linkedIssues(body: string): number[] {
  const found = [...body.matchAll(/\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s*:?\s+#(\d+)/gi)];
  return [...new Set(found.map((m) => Number(m[1])))];
}

/** GITHUB_TOKEN, else the token of a logged-in GitHub CLI, else none (60 requests/hour). */
export function resolveGitHubToken(config: Config): string | undefined {
  if (config.githubToken) return config.githubToken;
  try {
    return (
      execFileSync("gh", ["auth", "token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

interface CacheEntry {
  etag: string;
  body: unknown;
}

/** Minimal GitHub REST client with an on-disk ETag cache (304 responses are free of rate limit). */
export class GitHubClient {
  private readonly cacheDir: string;

  constructor(
    private readonly slug: string,
    private readonly token: string | undefined,
    cacheRoot: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.cacheDir = path.join(cacheRoot, slug.replace("/", "__"));
  }

  async get<T>(route: string): Promise<T | undefined> {
    const key = route.replace(/[^A-Za-z0-9]+/g, "_");
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    const cached = existsSync(cacheFile)
      ? (JSON.parse(readFileSync(cacheFile, "utf8")) as CacheEntry)
      : undefined;

    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dejabug",
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (cached) headers["if-none-match"] = cached.etag;

    const res = await this.fetchImpl(`${API}/repos/${this.slug}${route}`, { headers });
    if (res.status === 304 && cached) return cached.body as T;
    if (res.status === 404) return undefined;
    if (!res.ok) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      const hint = remaining === "0" ? " (rate limit hit: set GITHUB_TOKEN or run `gh auth login`)" : "";
      throw new Error(`GitHub ${res.status} for ${route}${hint}`);
    }
    const body = (await res.json()) as T;
    const etag = res.headers.get("etag");
    if (etag) {
      mkdirSync(this.cacheDir, { recursive: true });
      writeFileSync(cacheFile, JSON.stringify({ etag, body } satisfies CacheEntry));
    }
    return body;
  }
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  merged_at: string | null;
  comments?: number;
  review_comments?: number;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  comments: number;
  pull_request?: unknown;
}

interface Comment {
  body: string | null;
}

interface Review {
  state: string;
}

export function createGitHubClient(config: Config, fetchImpl?: typeof fetch): GitHubClient {
  return new GitHubClient(
    config.repoSlug,
    resolveGitHubToken(config),
    path.join(config.repoRoot, ".cache", "github"),
    fetchImpl,
  );
}

/** The PR that introduced the fix: from "(#123)" in the subject, else GitHub's commit-to-PR lookup. */
export async function resolvePr(gh: GitHubClient, candidate: Candidate): Promise<PullRequest | undefined> {
  if (candidate.prNumber) return gh.get<PullRequest>(`/pulls/${candidate.prNumber}`);
  const pulls = await gh.get<PullRequest[]>(`/commits/${candidate.fixSha}/pulls`);
  const merged = pulls?.find((p) => p.merged_at) ?? pulls?.[0];
  return merged ? gh.get<PullRequest>(`/pulls/${merged.number}`) : undefined;
}

/** PR, linked issue, and conversation text for one candidate, with personal information redacted. */
export async function fetchContext(gh: GitHubClient, candidate: Candidate): Promise<GitHubContext> {
  const pr = await resolvePr(gh, candidate);
  if (!pr) {
    return { prTitle: candidate.subject, prBody: "", issueTitle: "", issueBody: "", combinedComments: "" };
  }

  const issueNumber = linkedIssues(pr.body ?? "")[0];
  const issue = issueNumber ? await gh.get<Issue>(`/issues/${issueNumber}`) : undefined;
  const prComments = (await gh.get<Comment[]>(`/issues/${pr.number}/comments?per_page=50`)) ?? [];
  const issueComments = issue
    ? ((await gh.get<Comment[]>(`/issues/${issue.number}/comments?per_page=50`)) ?? [])
    : [];

  const combined = [...issueComments, ...prComments]
    .map((c) => redact(c.body, 1500))
    .filter(Boolean)
    .join("\n---\n");

  return {
    prNumber: pr.number,
    prTitle: redact(pr.title, 300),
    prBody: redact(pr.body),
    issueNumber: issue?.number,
    issueTitle: redact(issue?.title, 300),
    issueBody: redact(issue?.body),
    combinedComments:
      combined.length > MAX_COMMENTS ? `${combined.slice(0, MAX_COMMENTS)}\n[truncated]` : combined,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long the original team took, as counts and durations only (no people). */
export async function fetchOriginalEffort(gh: GitHubClient, candidate: Candidate): Promise<OriginalEffort> {
  const pr = await resolvePr(gh, candidate);
  if (!pr) return { mergedAt: candidate.date };

  const issueNumber = linkedIssues(pr.body ?? "")[0];
  const issue = issueNumber ? await gh.get<Issue>(`/issues/${issueNumber}`) : undefined;
  const reviews = (await gh.get<Review[]>(`/pulls/${pr.number}/reviews?per_page=100`)) ?? [];

  const opened = new Date(issue?.created_at ?? pr.created_at).getTime();
  const merged = new Date(pr.merged_at ?? candidate.date).getTime();
  return {
    daysOpen: Math.max(0, Math.round(((merged - opened) / DAY_MS) * 10) / 10),
    comments: (pr.comments ?? 0) + (pr.review_comments ?? 0) + (issue?.comments ?? 0),
    reviewRounds: reviews.filter((r) => r.state !== "PENDING").length,
    mergedAt: pr.merged_at ?? candidate.date,
  };
}
