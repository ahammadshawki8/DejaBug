/** Accepts owner/name or a GitHub URL, like the engine's normalizeSlug. */
export function parseRepoInput(input: string): string | undefined {
  const cleaned = input
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  const m = /(?:github\.com[/:])?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(cleaned);
  return m ? `${m[1]}/${m[2]}` : undefined;
}
