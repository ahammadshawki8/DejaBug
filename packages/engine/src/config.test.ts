import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, normalizeSlug } from "./config.js";

const root = path.resolve("/tmp/dejabug");

describe("loadConfig", () => {
  it("defaults to sarama paths and the watsonx provider", () => {
    const c = loadConfig({}, root);
    expect(c.repoSlug).toBe("IBM/sarama");
    expect(c.repoDir).toBe(path.join(root, "workspace", "sarama"));
    expect(c.casesDir).toBe(path.join(root, "cases", "sarama"));
    expect(c.llmProvider).toBe("watsonx");
    expect(c.port).toBe(4317);
  });

  it("honours overrides", () => {
    const c = loadConfig({ LLM_PROVIDER: "BOB", DEJABUG_PORT: "9000", GITHUB_TOKEN: "" }, root);
    expect(c.llmProvider).toBe("bob");
    expect(c.port).toBe(9000);
    expect(c.githubToken).toBeUndefined();
  });

  it("rejects an unknown provider", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "openai" }, root)).toThrow(/LLM_PROVIDER/);
  });
});

describe("normalizeSlug and --target", () => {
  it("accepts owner/name and GitHub URLs", () => {
    expect(normalizeSlug("IBM/sarama")).toBe("IBM/sarama");
    expect(normalizeSlug("https://github.com/IBM/fp-go.git")).toBe("IBM/fp-go");
    expect(normalizeSlug("git@github.com:IBM/python-sdk-core.git")).toBe("IBM/python-sdk-core");
    expect(() => normalizeSlug("not a repo")).toThrow(/GitHub repository/);
  });

  it("derives workspace and cases dirs from the target, ignoring repo-dir env overrides", () => {
    const c = loadConfig({ DEJABUG_REPO_DIR: "elsewhere" }, root, { target: "IBM/fp-go" });
    expect(c.repoSlug).toBe("IBM/fp-go");
    expect(c.repoDir).toBe(path.join(root, "workspace", "fp-go"));
    expect(c.casesDir).toBe(path.join(root, "cases", "fp-go"));
  });
});
